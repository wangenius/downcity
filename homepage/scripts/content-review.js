#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration
const DOCS_DIR = path.join(__dirname, '../content/docs');
const BASE_URL = '/docs';

class ContentReviewer {
  constructor() {
    this.issues = [];
    this.warnings = [];
    this.reviewedFiles = 0;
    this.existingFiles = new Set();
    this.allLinks = [];
  }

  async reviewAllContent() {
    console.log('📋 Starting comprehensive content review...\n');
    
    // Build index of existing files
    this.buildFileIndex();
    
    // Find all MDX files
    const mdxFiles = this.findMdxFiles(DOCS_DIR);
    
    // Review each file
    for (const file of mdxFiles) {
      await this.reviewFile(file);
    }

    // Validate navigation structure
    this.validateNavigationStructure();
    
    // Check for content completeness
    this.checkContentCompleteness();

    this.printResults();
    
    return this.issues.length === 0;
  }

  buildFileIndex() {
    console.log('📋 Building file index...');
    
    const addToIndex = (dir, basePath = '') => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          addToIndex(fullPath, path.join(basePath, item));
        } else if (item.endsWith('.mdx')) {
          const fileName = item.replace('.mdx', '');
          const urlPath = path.join(basePath, fileName).replace(/\\/g, '/');
          this.existingFiles.add(`${BASE_URL}/${urlPath}`);
          
          // Also add index files without the filename
          if (fileName === 'index') {
            const dirPath = basePath.replace(/\\/g, '/');
            this.existingFiles.add(`${BASE_URL}/${dirPath}`);
            if (dirPath === '') {
              this.existingFiles.add(BASE_URL);
            }
          }
        }
      }
    };
    
    addToIndex(DOCS_DIR);
    console.log(`📄 Found ${this.existingFiles.size} documentation pages\n`);
  }

  findMdxFiles(dir) {
    const files = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...this.findMdxFiles(fullPath));
      } else if (item.endsWith('.mdx')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  async reviewFile(filePath) {
    const relativePath = path.relative(DOCS_DIR, filePath);
    console.log(`📄 Reviewing ${relativePath}...`);

    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check frontmatter
    this.checkFrontmatter(content, relativePath);
    
    // Extract and validate links
    const links = this.extractLinks(content);
    this.allLinks.push(...links.map(link => ({ ...link, file: relativePath })));
    
    for (const link of links) {
      this.validateLink(link, relativePath);
    }
    
    // Check content structure
    this.checkContentStructure(content, relativePath);
    
    // Check for clarity and completeness
    this.checkContentClarity(content, relativePath);

    this.reviewedFiles++;
  }

  checkFrontmatter(content, filePath) {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (!frontmatterMatch) {
      this.issues.push({
        file: filePath,
        type: 'frontmatter',
        error: 'Missing frontmatter (title and description required)'
      });
      return;
    }
    
    const frontmatter = frontmatterMatch[1];
    
    if (!frontmatter.includes('title:')) {
      this.issues.push({
        file: filePath,
        type: 'frontmatter',
        error: 'Missing title in frontmatter'
      });
    }
    
    if (!frontmatter.includes('description:')) {
      this.issues.push({
        file: filePath,
        type: 'frontmatter',
        error: 'Missing description in frontmatter'
      });
    }
  }

  extractLinks(content) {
    const links = [];
    
    // Markdown links: [text](url)
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    
    while ((match = markdownLinkRegex.exec(content)) !== null) {
      links.push({
        text: match[1],
        url: match[2],
        type: 'markdown',
        fullMatch: match[0]
      });
    }
    
    // HTML links: <a href="url">
    const htmlLinkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>/g;
    
    while ((match = htmlLinkRegex.exec(content)) !== null) {
      links.push({
        text: 'HTML link',
        url: match[1],
        type: 'html',
        fullMatch: match[0]
      });
    }

    return links;
  }

  validateLink(link, filePath) {
    const url = link.url.trim();
    
    // Skip certain types of links
    if (this.shouldSkipLink(url)) {
      return;
    }
    
    // Validate internal documentation links
    if (url.startsWith('/docs/')) {
      this.validateInternalLink(url, link, filePath);
    }
    // Validate relative links
    else if (url.startsWith('./') || url.startsWith('../')) {
      this.warnings.push({
        file: filePath,
        link: url,
        text: link.text,
        type: 'relative_link',
        warning: 'Relative link found - verify manually'
      });
    }
    // External HTTP links
    else if (url.startsWith('http://')) {
      this.warnings.push({
        file: filePath,
        link: url,
        text: link.text,
        type: 'http_link',
        warning: 'HTTP link (consider HTTPS)'
      });
    }
  }

  shouldSkipLink(url) {
    const skipPatterns = [
      /^https?:\/\//, // External HTTPS links (we'll check HTTP separately)
      /^mailto:/, // Email links
      /^tel:/, // Phone links
      /^javascript:/, // JavaScript links
      /^\{/, // Template variables
      /^\$/, // Variables
      /^#/, // Anchor links
    ];

    return skipPatterns.some(pattern => pattern.test(url)) && !url.startsWith('http://');
  }

  validateInternalLink(url, link, filePath) {
    // Remove hash fragments for file existence check
    const baseUrl = url.split('#')[0];
    
    if (!this.existingFiles.has(baseUrl)) {
      this.issues.push({
        file: filePath,
        link: url,
        text: link.text,
        type: 'broken_link',
        error: 'Internal link points to non-existent page'
      });
    }
  }

  checkContentStructure(content, filePath) {
    // Check for proper heading hierarchy
    const headings = content.match(/^#{1,6}\s+.+$/gm) || [];
    
    if (headings.length === 0) {
      this.warnings.push({
        file: filePath,
        type: 'structure',
        warning: 'No headings found - consider adding structure'
      });
      return;
    }
    
    // Check if first heading is H1
    const firstHeading = headings[0];
    if (!firstHeading.startsWith('# ')) {
      this.warnings.push({
        file: filePath,
        type: 'structure',
        warning: 'First heading should be H1 (#)'
      });
    }
    
    // Check for code examples in guides and examples
    if (filePath.includes('guides/') || filePath.includes('examples/')) {
      const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
      if (codeBlocks.length === 0) {
        this.warnings.push({
          file: filePath,
          type: 'content',
          warning: 'Guide/example should include code examples'
        });
      }
    }
  }

  checkContentClarity(content, filePath) {
    // Check for minimum content length
    const contentWithoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');
    const wordCount = contentWithoutFrontmatter.split(/\s+/).length;
    
    if (wordCount < 100) {
      this.warnings.push({
        file: filePath,
        type: 'content',
        warning: `Content seems short (${wordCount} words) - consider expanding`
      });
    }
    
    // Check for "Next Steps" or navigation in longer content
    if (wordCount > 500 && !content.includes('Next Steps') && !content.includes('next steps')) {
      this.warnings.push({
        file: filePath,
        type: 'navigation',
        warning: 'Long content should include "Next Steps" section'
      });
    }
  }

  validateNavigationStructure() {
    console.log('\n🧭 Validating navigation structure...');
    
    // Check for meta.json files in each directory
    const expectedDirs = ['getting-started', 'core-concepts', 'guides', 'api-reference', 'examples'];
    
    for (const dir of expectedDirs) {
      const metaPath = path.join(DOCS_DIR, dir, 'meta.json');
      if (!fs.existsSync(metaPath)) {
        this.issues.push({
          file: `${dir}/meta.json`,
          type: 'navigation',
          error: 'Missing meta.json file for navigation'
        });
      } else {
        // Validate meta.json structure
        try {
          const metaContent = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          if (!metaContent.title || !metaContent.pages) {
            this.issues.push({
              file: `${dir}/meta.json`,
              type: 'navigation',
              error: 'meta.json missing required fields (title, pages)'
            });
          }
        } catch (error) {
          this.issues.push({
            file: `${dir}/meta.json`,
            type: 'navigation',
            error: 'Invalid JSON in meta.json'
          });
        }
      }
    }
  }

  checkContentCompleteness() {
    console.log('\n📋 Checking content completeness...');
    
    // Check for required pages based on requirements
    const requiredPages = [
      '/docs/getting-started/installation',
      '/docs/getting-started/quick-start', 
      '/docs/getting-started/first-agent',
      '/docs/core-concepts/overview',
      '/docs/core-concepts/hero',
      '/docs/core-concepts/memory-system',
      '/docs/core-concepts/room',
      '/docs/core-concepts/shot',
      '/docs/core-concepts/codex',
      '/docs/guides/building-chatbot',
      '/docs/guides/memory-management',
      '/docs/guides/knowledge-integration',
      '/docs/guides/advanced-patterns',
      '/docs/api-reference/hero-api',
      '/docs/api-reference/room-api',
      '/docs/api-reference/shot-api',
      '/docs/api-reference/codex-api',
      '/docs/examples/basic-agent',
      '/docs/examples/persistent-memory',
      '/docs/examples/knowledge-base'
    ];
    
    for (const page of requiredPages) {
      if (!this.existingFiles.has(page)) {
        this.issues.push({
          file: page,
          type: 'completeness',
          error: 'Required page missing from documentation'
        });
      }
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📋 CONTENT REVIEW RESULTS');
    console.log('='.repeat(60));
    
    console.log(`📄 Files reviewed: ${this.reviewedFiles}`);
    console.log(`🔗 Links checked: ${this.allLinks.length}`);
    console.log(`❌ Issues: ${this.issues.length}`);
    console.log(`⚠️  Warnings: ${this.warnings.length}`);

    if (this.issues.length > 0) {
      console.log('\n❌ CRITICAL ISSUES:');
      this.issues.forEach((issue, index) => {
        console.log(`\n${index + 1}. ${issue.file}`);
        console.log(`   Type: ${issue.type}`);
        console.log(`   Issue: ${issue.error}`);
        if (issue.link) {
          console.log(`   Link: ${issue.link}`);
        }
      });
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      this.warnings.forEach((warning, index) => {
        console.log(`\n${index + 1}. ${warning.file}`);
        console.log(`   Type: ${warning.type}`);
        console.log(`   Warning: ${warning.warning}`);
        if (warning.link) {
          console.log(`   Link: ${warning.link}`);
        }
      });
    }

    if (this.issues.length === 0 && this.warnings.length === 0) {
      console.log('\n🎉 All content looks great! No issues found.');
    } else if (this.issues.length === 0) {
      console.log('\n✅ No critical issues found. Review warnings for improvements.');
    } else {
      console.log(`\n💥 Found ${this.issues.length} critical issues that need fixing.`);
    }

    // Show navigation structure
    console.log('\n📋 Documentation Structure:');
    const sortedFiles = Array.from(this.existingFiles).sort();
    sortedFiles.forEach(file => {
      console.log(`   ${file}`);
    });
  }
}

// Run review if called directly
if (require.main === module) {
  const reviewer = new ContentReviewer();
  reviewer.reviewAllContent()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Content review failed:', error);
      process.exit(1);
    });
}

module.exports = ContentReviewer;