'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function HomePage() {
  const [copied, setCopied] = useState('');
  const [activeTab, setActiveTab] = useState('hero');
  const [animatedText, setAnimatedText] = useState('');
  const fullText = 'Welcome to DownCity';

  // 打字机效果
  useEffect(() => {
    let index = 0;
    const timer = setInterval(() => {
      if (index < fullText.length) {
        setAnimatedText(fullText.slice(0, index + 1));
        index++;
      } else {
        clearInterval(timer);
      }
    }, 150);
    return () => clearInterval(timer);
  }, []);

  const codeExamples = {
    hero: `// 在数字城市中创建你的第一个英雄
import { Hero } from 'downcity';

const digitalHero = new Hero({
  name: 'CodeGuardian',
  model: 'gpt-4',
  personality: 'wise-protector',
  abilities: ['coding', 'debugging', 'mentoring']
});

// 英雄开始他的使命
const mission = await digitalHero.embark(
  '帮助开发者构建更好的应用'
);`,
    room: `// 构建智能房间，连接多个英雄
import { Hero, Room } from 'downcity';

const codeRoom = new Room({
  name: 'DeveloperHub',
  theme: 'cyberpunk',
  capacity: 10
});

const mentor = new Hero({ name: 'CodeMentor' });
const assistant = new Hero({ name: 'DevAssistant' });

// 英雄们在房间中协作
codeRoom.invite([mentor, assistant]);
const collaboration = await codeRoom.startSession(
  '让我们一起解决这个架构问题'
);`,
    codex: `// 知识法典：城市的智慧宝库
import { Hero, Codex } from 'downcity';

const ancientCodex = new Codex({
  name: 'TechGrimoire',
  type: 'knowledge-vault',
  encryption: 'quantum'
});

// 将珍贵的知识存入法典
ancientCodex.inscribe([
  'react-best-practices.md',
  'system-architecture.pdf',
  'debugging-wisdom.txt'
]);

const scholar = new Hero({
  name: 'KnowledgeSeeker',
  codex: ancientCodex
});

// 英雄从法典中汲取智慧
const wisdom = await scholar.consult(
  '如何优化大型React应用的性能？'
);`
  };

  const copyToClipboard = async (code: string, type: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(type);
      setTimeout(() => setCopied(''), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };
  return (
    <main className="flex flex-1 flex-col bg-black">
      {/* Hero Section */}
      <section className="relative flex flex-1 flex-col justify-center items-center text-center px-6 py-20 overflow-hidden">
        {/* Cyberpunk Background */}
         <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-green-950">
           {/* Matrix-like grid */}
           <div className="absolute inset-0 opacity-30" style={{
             backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2300ff41' fill-opacity='0.1'%3E%3Cpath d='M20 20h20v20H20V20zm-20 0h20v20H0V20z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
           }}></div>
           {/* Glowing particles */}
           <div className="absolute inset-0">
             <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-green-400 rounded-full animate-pulse opacity-60"></div>
             <div className="absolute top-3/4 right-1/3 w-1 h-1 bg-green-300 rounded-full animate-ping opacity-40"></div>
             <div className="absolute bottom-1/4 left-2/3 w-3 h-3 bg-green-500 rounded-full animate-pulse opacity-50"></div>
           </div>
         </div>
        
        <div className="relative max-w-6xl mx-auto z-10">
          {/* Main Headline with Cyberpunk Animation */}
          <div className="mb-6">
            <div className="text-green-400 text-sm font-mono mb-4 opacity-80">
               &gt; SYSTEM INITIALIZING...
             </div>
            <h1 className="text-4xl md:text-6xl font-bold font-mono min-h-[4rem] md:min-h-[6rem] text-white">
              {animatedText}
              <span className="animate-pulse text-green-400">_</span>
            </h1>
            <div className="text-green-400 text-sm font-mono mb-6 opacity-80">
               &gt; DIGITAL REALM ACTIVATED
             </div>
          </div>
          
          {/* Subheadline */}
          <p className="text-xl md:text-2xl text-gray-300 mb-8 leading-relaxed max-w-4xl mx-auto">
            在这座数字城市中，<span className="text-green-400 font-semibold">英雄</span>们在智能<span className="text-green-400 font-semibold">房间</span>里协作，
            <br />从古老的<span className="text-green-400 font-semibold">法典</span>中汲取知识，构建下一代AI应用。
          </p>

          {/* Cyberpunk Stats */}
          <div className="flex flex-wrap justify-center gap-8 mb-12 text-sm">
            <div className="border border-green-500/30 bg-green-950/20 rounded-lg p-3 backdrop-blur-sm">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse mx-auto mb-2"></div>
              <span className="text-gray-400 font-mono">HEROES_ACTIVE</span>
            </div>
            <div className="border border-green-500/30 bg-green-950/20 rounded-lg p-3 backdrop-blur-sm">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse mx-auto mb-2"></div>
              <span className="text-gray-400 font-mono">ROOMS_ONLINE</span>
            </div>
            <div className="border border-green-500/30 bg-green-950/20 rounded-lg p-3 backdrop-blur-sm">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse mx-auto mb-2"></div>
              <span className="text-gray-400 font-mono">CODEX_WISDOM</span>
            </div>
          </div>

          {/* Cyberpunk CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link
              href="/docs/getting-started/installation"
              className="group px-8 py-4 bg-green-500 hover:bg-green-400 text-black font-bold rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg shadow-green-500/25 border border-green-400 font-mono"
            >
              <span className="flex items-center gap-2">
                 &gt; ENTER_CITY
                 <span className="group-hover:translate-x-1 transition-transform">_</span>
               </span>
            </Link>
            <Link
              href="/docs/examples"
              className="px-8 py-4 border-2 border-green-500 hover:border-green-400 text-green-400 hover:text-green-300 font-bold rounded-lg transition-all duration-300 hover:bg-green-950/30 font-mono"
            >
              &gt; VIEW_EXAMPLES
            </Link>
          </div>

          {/* Interactive Code Preview */}
          <div className="bg-fd-card/80 backdrop-blur-sm border border-fd-border rounded-2xl p-6 text-left max-w-4xl mx-auto mb-16 shadow-2xl">
            {/* Tab Navigation */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex gap-2">
                {Object.keys(codeExamples).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                      activeTab === tab
                        ? 'bg-blue-500 text-white shadow-md'
                        : 'text-fd-muted-foreground hover:text-fd-foreground hover:bg-fd-muted/50'
                    }`}
                  >
                    {tab === 'basic' ? '🚀 Basic' : tab === 'memory' ? '🧠 Memory' : '📚 Knowledge'}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => copyToClipboard(codeExamples[activeTab as keyof typeof codeExamples], activeTab)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-fd-muted-foreground hover:text-fd-foreground transition-colors rounded-lg hover:bg-fd-muted/50"
              >
                {copied === activeTab ? (
                  <><span className="text-green-500">✓</span> Copied!</>
                ) : (
                  <><span>📋</span> Copy</>
                )}
              </button>
            </div>
            <pre className="text-sm overflow-x-auto bg-fd-muted/30 rounded-lg p-4">
              <code className="text-fd-foreground">
                {codeExamples[activeTab as keyof typeof codeExamples]}
              </code>
            </pre>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 bg-gradient-to-b from-fd-background via-fd-muted/20 to-fd-background">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Everything you need to build intelligent agents
            </h2>
            <p className="text-lg text-fd-muted-foreground max-w-3xl mx-auto">
              From simple chatbots to complex AI systems, downcity provides all the tools you need
            </p>
          </div>
          
          {/* Main Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
            {/* Smart Agents */}
            <div className="group bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/50 border border-blue-200 dark:border-blue-800 rounded-2xl p-8 text-center hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2">
              <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-300">🤖</div>
              <h3 className="text-2xl font-bold mb-4 text-blue-700 dark:text-blue-300">Smart Agents</h3>
              <p className="text-fd-muted-foreground mb-4">
                Create AI agents with the Hero class. Configure personalities, skills, and behaviors with ease.
              </p>
              <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                ✨ TypeScript Native • 🎯 Skill System • 🎭 Personality Config
              </div>
            </div>

            {/* Memory System */}
            <div className="group bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/50 dark:to-purple-900/50 border border-purple-200 dark:border-purple-800 rounded-2xl p-8 text-center hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2">
              <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-300">🧠</div>
              <h3 className="text-2xl font-bold mb-4 text-purple-700 dark:text-purple-300">Memory System</h3>
              <p className="text-fd-muted-foreground mb-4">
                Three-tier memory architecture: Shot → Room → Codex for intelligent context management.
              </p>
              <div className="text-sm text-purple-600 dark:text-purple-400 font-medium">
                💾 Persistent Memory • 🔄 Auto Cleanup • 📊 Context Aware
              </div>
            </div>

            {/* Knowledge Base */}
            <div className="group bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/50 dark:to-green-900/50 border border-green-200 dark:border-green-800 rounded-2xl p-8 text-center hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2">
              <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-300">📚</div>
              <h3 className="text-2xl font-bold mb-4 text-green-700 dark:text-green-300">Knowledge Base</h3>
              <p className="text-fd-muted-foreground mb-4">
                Vector-based knowledge storage with Codex for intelligent information retrieval and RAG.
              </p>
              <div className="text-sm text-green-600 dark:text-green-400 font-medium">
                🔍 Vector Search • 📖 RAG Support • 🚀 Fast Retrieval
              </div>
            </div>

            {/* Session Management */}
            <div className="group bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/50 dark:to-orange-900/50 border border-orange-200 dark:border-orange-800 rounded-2xl p-8 text-center hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2">
              <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-300">🔄</div>
              <h3 className="text-2xl font-bold mb-4 text-orange-700 dark:text-orange-300">Session Management</h3>
              <p className="text-fd-muted-foreground mb-4">
                Persistent conversation context across sessions with automatic cleanup and optimization.
              </p>
              <div className="text-sm text-orange-600 dark:text-orange-400 font-medium">
                💬 Multi-Session • 🧹 Auto Cleanup • ⚡ Optimized
              </div>
            </div>

            {/* AI-SDK Integration */}
            <div className="group bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-950/50 dark:to-pink-900/50 border border-pink-200 dark:border-pink-800 rounded-2xl p-8 text-center hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2">
              <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-300">⚡</div>
              <h3 className="text-2xl font-bold mb-4 text-pink-700 dark:text-pink-300">AI-SDK Ready</h3>
              <p className="text-fd-muted-foreground mb-4">
                Built on top of Vercel&apos;s AI SDK with support for all major LLM providers.
              </p>
              <div className="text-sm text-pink-600 dark:text-pink-400 font-medium">
                🤖 Multi-Provider • 🔌 Easy Integration • 📡 Streaming
              </div>
            </div>

            {/* Developer Experience */}
            <div className="group bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950/50 dark:to-indigo-900/50 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-8 text-center hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2">
              <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-300">👨‍💻</div>
              <h3 className="text-2xl font-bold mb-4 text-indigo-700 dark:text-indigo-300">Developer First</h3>
              <p className="text-fd-muted-foreground mb-4">
                Excellent TypeScript support, comprehensive docs, and intuitive API design.
              </p>
              <div className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                📝 Full TypeScript • 📚 Rich Docs • 🎯 Intuitive API
              </div>
            </div>
          </div>

          {/* Architecture Diagram */}
          <div className="bg-fd-card/50 backdrop-blur-sm border border-fd-border rounded-2xl p-8 mb-16">
            <h3 className="text-2xl font-bold text-center mb-8">Architecture Overview</h3>
            <div className="flex flex-col md:flex-row items-center justify-center gap-8">
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-2">H</div>
                <span className="text-sm font-medium">Hero</span>
                <span className="text-xs text-fd-muted-foreground">AI Agent</span>
              </div>
              <div className="text-2xl text-fd-muted-foreground">→</div>
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 bg-purple-500 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-2">R</div>
                <span className="text-sm font-medium">Room</span>
                <span className="text-xs text-fd-muted-foreground">Memory Space</span>
              </div>
              <div className="text-2xl text-fd-muted-foreground">→</div>
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-2">S</div>
                <span className="text-sm font-medium">Shot</span>
                <span className="text-xs text-fd-muted-foreground">Conversation</span>
              </div>
              <div className="text-2xl text-fd-muted-foreground">↔</div>
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 bg-orange-500 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-2">C</div>
                <span className="text-sm font-medium">Codex</span>
                <span className="text-xs text-fd-muted-foreground">Knowledge</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Built for Real-World Applications</h2>
            <p className="text-lg text-fd-muted-foreground max-w-2xl mx-auto">
              See how developers are using downcity to build amazing AI experiences
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Customer Support */}
            <div className="bg-fd-card border border-fd-border rounded-xl p-6 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">🎧</span>
                </div>
                <h3 className="text-xl font-semibold">Customer Support</h3>
              </div>
              <p className="text-fd-muted-foreground mb-4">
                Build intelligent support agents that remember customer history and access your knowledge base.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs rounded-full">24/7 Support</span>
                <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs rounded-full">Context Aware</span>
              </div>
            </div>

            {/* Personal Assistant */}
            <div className="bg-fd-card border border-fd-border rounded-xl p-6 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">🤵</span>
                </div>
                <h3 className="text-xl font-semibold">Personal Assistant</h3>
              </div>
              <p className="text-fd-muted-foreground mb-4">
                Create personalized AI assistants that learn user preferences and maintain long-term memory.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 text-xs rounded-full">Personalized</span>
                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 text-xs rounded-full">Learning</span>
              </div>
            </div>

            {/* Educational Tutor */}
            <div className="bg-fd-card border border-fd-border rounded-xl p-6 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">🎓</span>
                </div>
                <h3 className="text-xl font-semibold">Educational Tutor</h3>
              </div>
              <p className="text-fd-muted-foreground mb-4">
                Build adaptive learning systems that track student progress and provide personalized instruction.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs rounded-full">Adaptive</span>
                <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs rounded-full">Progress Tracking</span>
              </div>
            </div>

            {/* Content Creator */}
            <div className="bg-fd-card border border-fd-border rounded-xl p-6 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">✍️</span>
                </div>
                <h3 className="text-xl font-semibold">Content Creator</h3>
              </div>
              <p className="text-fd-muted-foreground mb-4">
                Develop AI writers that understand your brand voice and maintain consistency across content.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 text-xs rounded-full">Brand Voice</span>
                <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 text-xs rounded-full">Consistent</span>
              </div>
            </div>

            {/* Research Assistant */}
            <div className="bg-fd-card border border-fd-border rounded-xl p-6 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">🔬</span>
                </div>
                <h3 className="text-xl font-semibold">Research Assistant</h3>
              </div>
              <p className="text-fd-muted-foreground mb-4">
                Build research agents that can analyze documents, synthesize information, and maintain research context.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300 text-xs rounded-full">Document Analysis</span>
                <span className="px-2 py-1 bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300 text-xs rounded-full">Synthesis</span>
              </div>
            </div>

            {/* Gaming NPCs */}
            <div className="bg-fd-card border border-fd-border rounded-xl p-6 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">🎮</span>
                </div>
                <h3 className="text-xl font-semibold">Gaming NPCs</h3>
              </div>
              <p className="text-fd-muted-foreground mb-4">
                Create intelligent NPCs that remember player interactions and evolve their personalities over time.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs rounded-full">Dynamic</span>
                <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs rounded-full">Evolving</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Start Section */}
      <section className="py-20 px-6 bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50 dark:from-blue-950/20 dark:via-purple-950/20 dark:to-pink-950/20">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to Get Started?</h2>
          <p className="text-lg text-fd-muted-foreground mb-12 max-w-2xl mx-auto">
            Join thousands of developers building the next generation of AI applications with downcity
          </p>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-4">1</div>
              <h3 className="text-xl font-semibold mb-2">Install</h3>
              <p className="text-fd-muted-foreground text-sm">npm install downcity</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-purple-500 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-4">2</div>
              <h3 className="text-xl font-semibold mb-2">Create</h3>
              <p className="text-fd-muted-foreground text-sm">Build your first Hero agent</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-pink-500 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-4">3</div>
              <h3 className="text-xl font-semibold mb-2">Deploy</h3>
              <p className="text-fd-muted-foreground text-sm">Ship intelligent AI experiences</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/docs/getting-started/installation"
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg"
            >
              Start Building Now
            </Link>
            <Link
              href="/docs"
              className="px-8 py-4 border-2 border-fd-border hover:border-blue-500 text-fd-foreground font-semibold rounded-xl transition-all duration-300 hover:bg-fd-muted/50"
            >
              Read Documentation
            </Link>
          </div>
        </div>
      </section>

      {/* Community Section */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Join the Community</h2>
            <p className="text-lg text-fd-muted-foreground max-w-2xl mx-auto">
              Connect with other developers, share your projects, and get help from the community
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <a
              href="https://github.com/wangenius/downcity"
              target="_blank"
              rel="noopener noreferrer"
              className="group bg-fd-card border border-fd-border rounded-xl p-6 text-center hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1"
            >
              <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">⭐</div>
              <h3 className="text-lg font-semibold mb-2">GitHub</h3>
              <p className="text-fd-muted-foreground text-sm">Star the project and contribute</p>
            </a>

            <a
              href="https://github.com/wangenius/downcity/discussions"
              target="_blank"
              rel="noopener noreferrer"
              className="group bg-fd-card border border-fd-border rounded-xl p-6 text-center hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1"
            >
              <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">💬</div>
              <h3 className="text-lg font-semibold mb-2">Discussions</h3>
              <p className="text-fd-muted-foreground text-sm">Ask questions and share ideas</p>
            </a>

            <a
              href="https://github.com/wangenius/downcity/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="group bg-fd-card border border-fd-border rounded-xl p-6 text-center hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1"
            >
              <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">🐛</div>
              <h3 className="text-lg font-semibold mb-2">Issues</h3>
              <p className="text-fd-muted-foreground text-sm">Report bugs and request features</p>
            </a>

            <Link
              href="/docs/examples"
              className="group bg-fd-card border border-fd-border rounded-xl p-6 text-center hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1"
            >
              <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">📚</div>
              <h3 className="text-lg font-semibold mb-2">Examples</h3>
              <p className="text-fd-muted-foreground text-sm">Explore code examples and tutorials</p>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
