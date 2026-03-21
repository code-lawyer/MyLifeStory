import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { worldsApi } from '../api/worlds.js';
import { playerApi } from '../api/player.js';
import { eventsApi } from '../api/events.js';
import { scenesApi } from '../api/scenes.js';
import { useEventStore } from '../stores/eventStore.js';
import { useWorldStore } from '../stores/worldStore.js';
import { useChatStore } from '../stores/chatStore.js';
import ChatPane from '../components/chat/ChatPane.jsx';
import EventProposalCard from '../components/chat/EventProposalCard.jsx';
import MapPanel from '../components/panels/MapPanel.jsx';
import PlayerProfilePanel from '../components/panels/PlayerProfilePanel.jsx';
import InventoryPanel from '../components/panels/InventoryPanel.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import InitPlayerModal from '../components/world/InitPlayerModal.jsx';
import InitScenesModal from '../components/world/InitScenesModal.jsx';

const NARRATIVE_MODES = [
  { value: 'intimate', label: '亲密 (50% 对话)' },
  { value: 'ensemble', label: '群像 (35% 对话)' },
  { value: 'epic', label: '史诗 (25% 对话)' },
];

export default function WorldPage() {
  const { worldId } = useParams();
  const [world, setWorld] = useState(null);
  const [player, setPlayer] = useState(null);
  const [scenes, setScenes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showInventory, setShowInventory] = useState(false);

  const { narrativeMode, setNarrativeMode } = useWorldStore();
  const {
    pendingProposal, setPendingProposal, clearProposal,
    incrementTurns, setProposing, shouldPropose,
  } = useEventStore();

  const chatMessagesRef = useRef([]);
  const { messages: chatMessages, streaming: chatStreaming } = useChatStore();
  useEffect(() => { chatMessagesRef.current = chatMessages; }, [chatMessages]);

  useEffect(() => {
    useChatStore.getState().clearMessages();
    // Restore persisted history for this world
    try {
      const stored = JSON.parse(localStorage.getItem(`world-sim-chat-${worldId}`) || '[]');
      if (Array.isArray(stored) && stored.length > 0) useChatStore.getState().setMessages(stored);
    } catch { /* ignore */ }
    Promise.all([
      worldsApi.get(worldId),
      playerApi.get(worldId).catch(() => null),
      eventsApi.list(worldId).catch(() => ({ events: [] })),
      scenesApi.list(worldId).catch(() => ({ scenes: [] })),
    ]).then(([w, p, , s]) => {
      setWorld(w);
      setPlayer(p);
      setScenes(s.scenes || []);
    }).finally(() => setLoading(false));
  }, [worldId]);

  useEffect(() => {
    if (chatMessages.length === 0 || chatStreaming) return;
    try {
      localStorage.setItem(`world-sim-chat-${worldId}`, JSON.stringify(chatMessages));
    } catch { /* ignore quota */ }
  }, [worldId, chatMessages, chatStreaming]);

  const handleTurnComplete = useCallback(async () => {
    incrementTurns();
    if (!shouldPropose()) return;
    setProposing(true);
    try {
      const recentMessages = chatMessagesRef.current.slice(-10).filter(m => m.content);
      if (recentMessages.length === 0) return;
      const result = await eventsApi.propose(worldId, recentMessages, {});
      if (result.proposal) {
        setPendingProposal(result.proposal);
      }
    } finally {
      setProposing(false);
    }
  }, [worldId, incrementTurns, shouldPropose, setProposing, setPendingProposal]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-3 border-b bg-white shadow-sm">
        <h1 className="text-lg font-semibold flex-1">{world?.name}</h1>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={narrativeMode}
          onChange={(e) => setNarrativeMode(e.target.value)}
        >
          {NARRATIVE_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <Link
          to={`/world/${worldId}/archive`}
          className="text-sm text-blue-600 hover:underline"
        >
          世界档案
        </Link>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside className="w-56 border-r bg-white flex flex-col py-3 px-2 gap-2">
          <p className="text-xs text-gray-500 uppercase px-2">当前场景</p>
          <p className="text-sm px-2 truncate">{player?.status?.current_location || '未知'}</p>
          <div className="flex-1" />
          <div className="flex gap-1 px-1">
            <button
              className="flex-1 py-2 text-lg rounded hover:bg-gray-100"
              onClick={() => setShowMap(true)}
              aria-label="地图"
            >🗺</button>
            <button
              className="flex-1 py-2 text-lg rounded hover:bg-gray-100"
              onClick={() => setShowProfile(true)}
              aria-label="角色状态"
            >👤</button>
            <button
              className="flex-1 py-2 text-lg rounded hover:bg-gray-100"
              onClick={() => setShowInventory(true)}
              aria-label="背包"
            >🎒</button>
          </div>
        </aside>

        {/* Chat pane */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <ChatPane
            worldId={worldId}
            worldData={world}
            playerStatus={player?.status}
            narrativeMode={narrativeMode}
            onTurnComplete={handleTurnComplete}
          />
          {pendingProposal && (
            <div className="absolute bottom-20 left-0 right-0 px-3">
              <EventProposalCard
                worldId={worldId}
                proposal={pendingProposal}
                onDismiss={clearProposal}
              />
            </div>
          )}
        </div>
      </div>

      {/* Overlay panels */}
      {showMap && <MapPanel worldId={worldId} onClose={() => setShowMap(false)} />}
      {showProfile && <PlayerProfilePanel worldId={worldId} onClose={() => setShowProfile(false)} />}
      {showInventory && <InventoryPanel worldId={worldId} onClose={() => setShowInventory(false)} />}
      {!loading && !player && (
        <InitPlayerModal worldId={worldId} onCreated={(p) => setPlayer(p)} />
      )}
      {!loading && scenes !== null && scenes.length === 0 && (
        <InitScenesModal
          worldId={worldId}
          onCreated={(scene) => setScenes([scene])}
        />
      )}
    </div>
  );
}
