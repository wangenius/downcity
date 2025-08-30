'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function HomePage() {
  const [copied, setCopied] = useState(false);

  const codeExample = `import { Hero } from 'downcity';

// Create an AI agent
const hero = Hero.create()
  .avatar("You are a helpful assistant");

// Start chatting
const response = await hero.chat("Hello!");
console.log(response);`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(codeExample);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };
  return (
    <main className="flex flex-1 flex-col">
      {/* Hero Section */}
      <section className="flex flex-1 flex-col justify-center items-center text-center px-6 py-20">
        <div className="max-w-4xl mx-auto">
          {/* Main Headline */}
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Build Intelligent AI Agents with Memory
          </h1>
          
          {/* Subheadline */}
          <p className="text-xl md:text-2xl text-fd-muted-foreground mb-8 leading-relaxed">
            downcity provides a complete framework for creating AI agents with persistent memory, 
            knowledge management, and conversation context
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link
              href="/docs/getting-started/installation"
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              Get Started
            </Link>
            <Link
              href="/docs/examples"
              className="px-8 py-3 border border-fd-border hover:bg-fd-muted text-fd-foreground font-semibold rounded-lg transition-colors"
            >
              View Examples
            </Link>
          </div>

          {/* Code Preview */}
          <div className="bg-fd-card border border-fd-border rounded-lg p-6 text-left max-w-2xl mx-auto mb-16">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-fd-muted-foreground">Quick Start</span>
              <button 
                onClick={copyToClipboard}
                className="text-sm text-fd-muted-foreground hover:text-fd-foreground transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="text-sm overflow-x-auto">
              <code className="text-fd-foreground">
                {codeExample}
              </code>
            </pre>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 bg-fd-muted/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Everything you need to build intelligent agents
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Smart Agents */}
            <div className="bg-fd-card border border-fd-border rounded-lg p-6 text-center hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-4">🤖</div>
              <h3 className="text-xl font-semibold mb-3">Smart Agents</h3>
              <p className="text-fd-muted-foreground">
                Create AI agents with the Hero class. Configure personalities, skills, and behaviors.
              </p>
            </div>

            {/* Memory System */}
            <div className="bg-fd-card border border-fd-border rounded-lg p-6 text-center hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-4">🧠</div>
              <h3 className="text-xl font-semibold mb-3">Memory System</h3>
              <p className="text-fd-muted-foreground">
                Three-tier memory architecture: Shot → Room → Codex for context management.
              </p>
            </div>

            {/* Knowledge Base */}
            <div className="bg-fd-card border border-fd-border rounded-lg p-6 text-center hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-4">📚</div>
              <h3 className="text-xl font-semibold mb-3">Knowledge Base</h3>
              <p className="text-fd-muted-foreground">
                Vector-based knowledge storage with Codex for intelligent information retrieval.
              </p>
            </div>

            {/* Session Management */}
            <div className="bg-fd-card border border-fd-border rounded-lg p-6 text-center hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-4">🔄</div>
              <h3 className="text-xl font-semibold mb-3">Session Management</h3>
              <p className="text-fd-muted-foreground">
                Persistent conversation context across sessions with automatic cleanup.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
