"use client";

import { useState } from "react";

const layers = [
  {
    id: "human",
    title: "Human Layer",
    icon: "👥",
    accent: "from-orange-500/20 to-orange-600/10",
    border: "border-orange-500/30",
    activeBg: "bg-orange-500",
    desc: "Product Owner, Scrum Master, and Dev Team provide validation, decisions, and oversight. The system augments human judgment — never replaces it.",
  },
  {
    id: "orchestrator",
    title: "Orchestrator",
    icon: "🧠",
    accent: "from-blue-500/20 to-blue-600/10",
    border: "border-blue-500/30",
    activeBg: "bg-blue-500",
    desc: "Central brain coordinating all agents through a 7-phase pipeline. Maintains cross-sprint memory, detects cross-phase correlations, and generates intelligence reports with an AI Manager layer.",
  },
  {
    id: "agents",
    title: "Agent Layer",
    icon: "🤖",
    accent: "from-green-500/20 to-green-600/10",
    border: "border-green-500/30",
    activeBg: "bg-green-500",
    desc: "Four specialized agents — Backlog, Planning, Dev+Standup, and Review+Retro — each with independent Express.js APIs and React dashboards. Independently deployable.",
  },
  {
    id: "data",
    title: "Data & Memory",
    icon: "💾",
    accent: "from-gray-500/20 to-gray-600/10",
    border: "border-gray-500/30",
    activeBg: "bg-gray-500",
    desc: "Integrates JIRA Cloud, GitHub REST, Microsoft Teams (Graph API), and RAG embeddings via Ollama. Cross-sprint memory persists velocity, patterns, and retro actions.",
  },
  {
    id: "ai",
    title: "AI Stack",
    icon: "✨",
    accent: "from-purple-500/20 to-purple-600/10",
    border: "border-purple-500/30",
    activeBg: "bg-purple-500",
    desc: "Hybrid AI: Azure OpenAI GPT-4o (cloud), Microsoft Foundry Local phi model (on-device, zero data leaves machine), and Ollama nomic-embed-text (embeddings for RAG).",
  },
];

export default function Architecture() {
  const [active, setActive] = useState(1);

  return (
    <section id="architecture" className="py-28 px-6">
      <h2 className="text-4xl md:text-5xl font-bold text-center mb-4">
        System Architecture
      </h2>
      <p className="text-center text-gray-500 mb-14 max-w-2xl mx-auto text-lg">
        A human-in-the-loop multi-agent system combining local AI, cloud
        intelligence, and cross-sprint memory.
      </p>

      <div className="flex justify-center mb-14">
        <div className="relative">
          <img
            src="/architecture.png"
            alt="Agile Sprint Orchestrator Architecture"
            className="rounded-2xl border border-white/10 shadow-2xl max-w-3xl w-full"
            style={{
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(59, 130, 246, 0.08)',
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-3 mb-10 max-w-3xl mx-auto">
        {layers.map((layer, i) => (
          <button
            key={layer.id}
            onClick={() => setActive(i)}
            className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all cursor-pointer flex items-center gap-2 ${
              active === i
                ? `${layer.activeBg} text-white shadow-lg`
                : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span>{layer.icon}</span>
            {layer.title}
          </button>
        ))}
      </div>

      <div
        className={`max-w-3xl mx-auto p-8 rounded-2xl bg-gradient-to-br ${layers[active].accent} border ${layers[active].border} transition-all duration-500`}
      >
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">{layers[active].icon}</span>
          <h3 className="text-xl font-semibold">{layers[active].title}</h3>
        </div>
        <p className="text-gray-300 leading-relaxed text-lg">
          {layers[active].desc}
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3 mt-10">
        {["Human-in-the-loop", "Multi-Agent System", "Hybrid AI", "Cross-Sprint Memory", "MCP Protocol"].map((badge) => (
          <span
            key={badge}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-xs text-gray-400"
          >
            {badge}
          </span>
        ))}
      </div>
    </section>
  );
}
