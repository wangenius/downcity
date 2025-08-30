'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { searchContent, type SearchResult } from '@/lib/search';

export default function SearchPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'page' | 'heading' | 'text'>('all');

  useEffect(() => {
    if (query.trim().length > 0) {
      performSearch(query);
    } else {
      setResults([]);
    }
  }, [query]);

  const performSearch = async (searchQuery: string) => {
    setIsLoading(true);
    try {
      // Simulate API delay for better UX
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const searchResults = searchContent(searchQuery, 50);
      setResults(searchResults);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredResults = selectedCategory === 'all' 
    ? results 
    : results.filter(result => result.type === selectedCategory);

  const resultsByType = {
    page: results.filter(r => r.type === 'page').length,
    heading: results.filter(r => r.type === 'heading').length,
    text: results.filter(r => r.type === 'text').length,
  };

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Search Documentation</h1>
        <p className="text-fd-muted-foreground mb-6">
          Search across all downcity documentation including API references, guides, and examples.
        </p>
        
        {/* Search Input */}
        <div className="relative mb-6">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for Hero, Room, Shot, Codex, or any topic..."
            className="w-full px-4 py-3 text-lg border border-fd-border rounded-lg focus:outline-none focus:ring-2 focus:ring-fd-primary focus:border-transparent"
            autoFocus
          />
          {isLoading && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-fd-primary"></div>
            </div>
          )}
        </div>

        {/* Search Filters */}
        {results.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-fd-primary text-fd-primary-foreground'
                  : 'bg-fd-muted text-fd-muted-foreground hover:bg-fd-muted/80'
              }`}
            >
              All ({results.length})
            </button>
            <button
              onClick={() => setSelectedCategory('page')}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                selectedCategory === 'page'
                  ? 'bg-fd-primary text-fd-primary-foreground'
                  : 'bg-fd-muted text-fd-muted-foreground hover:bg-fd-muted/80'
              }`}
            >
              Pages ({resultsByType.page})
            </button>
            <button
              onClick={() => setSelectedCategory('heading')}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                selectedCategory === 'heading'
                  ? 'bg-fd-primary text-fd-primary-foreground'
                  : 'bg-fd-muted text-fd-muted-foreground hover:bg-fd-muted/80'
              }`}
            >
              Headings ({resultsByType.heading})
            </button>
            <button
              onClick={() => setSelectedCategory('text')}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                selectedCategory === 'text'
                  ? 'bg-fd-primary text-fd-primary-foreground'
                  : 'bg-fd-muted text-fd-muted-foreground hover:bg-fd-muted/80'
              }`}
            >
              Content ({resultsByType.text})
            </button>
          </div>
        )}
      </div>

      {/* Search Results */}
      <div className="space-y-4">
        {query.trim().length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <h2 className="text-xl font-semibold mb-2">Start searching</h2>
            <p className="text-fd-muted-foreground mb-6">
              Enter a search term to find relevant documentation.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {['Hero API', 'Room memory', 'Shot sessions', 'Codex search', 'Basic agent', 'Memory management'].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setQuery(suggestion)}
                  className="px-3 py-1 text-sm bg-fd-muted text-fd-muted-foreground rounded-full hover:bg-fd-muted/80 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {query.trim().length > 0 && filteredResults.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">😔</div>
            <h2 className="text-xl font-semibold mb-2">No results found</h2>
            <p className="text-fd-muted-foreground mb-4">
              We couldn't find anything matching "{query}".
            </p>
            <div className="text-sm text-fd-muted-foreground">
              <p>Try searching for:</p>
              <ul className="mt-2 space-y-1">
                <li>• API methods like "Hero.query" or "Room.createShot"</li>
                <li>• Core concepts like "memory system" or "conversation context"</li>
                <li>• Examples like "basic agent" or "knowledge base"</li>
                <li>• Guides like "building chatbot" or "memory management"</li>
              </ul>
            </div>
          </div>
        )}

        {filteredResults.map((result, index) => (
          <div key={result.id} className="border border-fd-border rounded-lg p-4 hover:bg-fd-muted/50 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <Link 
                href={result.url}
                className="text-lg font-semibold text-fd-primary hover:underline"
              >
                {result.title}
              </Link>
              <span className={`px-2 py-1 text-xs rounded-full ${
                result.type === 'page' 
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                  : result.type === 'heading'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
              }`}>
                {result.type}
              </span>
            </div>
            
            {result.content && (
              <p className="text-fd-muted-foreground mb-2 line-clamp-2">
                {result.content}
              </p>
            )}
            
            <div className="flex items-center justify-between">
              <span className="text-xs text-fd-muted-foreground">
                {result.url.replace('/docs/', '').replace('/', ' › ')}
              </span>
              <Link 
                href={result.url}
                className="text-sm text-fd-primary hover:underline"
              >
                View →
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Search Tips */}
      {query.trim().length > 0 && filteredResults.length > 0 && (
        <div className="mt-12 p-4 bg-fd-muted/50 rounded-lg">
          <h3 className="font-semibold mb-2">💡 Search Tips</h3>
          <ul className="text-sm text-fd-muted-foreground space-y-1">
            <li>• Use specific terms like "Hero.query" for API methods</li>
            <li>• Search for concepts like "memory persistence" or "vector search"</li>
            <li>• Try different variations of your search terms</li>
            <li>• Use the category filters to narrow down results</li>
          </ul>
        </div>
      )}
    </div>
  );
}