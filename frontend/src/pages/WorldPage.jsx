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
import CharacterSelector from '../components/world/CharacterSelector.jsx';
import { charactersApi } from '../api/characters.js';
import MapPanel from '../components/panels/MapPanel.jsx';
import PlayerProfilePanel from '../components/panels/PlayerProfilePanel.jsx';
import InventoryPanel from '../components/panels/InventoryPanel.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import InitPlayerModal from '../components/world/InitPlayerModal.jsx';
import InitScenesModal from '../components/world/InitScenesModal.jsx';
import { useSettingsStore } from '../stores/settingsStore.js';

const NARRATIVE_MODES = [
  { value: 'intimate', label: '亲密' },
  { value: 'ensemble', label: '群像' },
  { value: 'epic', label: '史诗' },
];

export default function WorldPage() {
  const { worldId } = useParams();
  const [world, setWorld] = useState(null);
  const [player, setPlayer] = useState(null);
  const [scenes, setScenes] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [activeCharacters, setActiveCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showInventory, setShowInventory] = useState(false);

  const { tokenBudget, getApiConfig } = useSettingsStore();
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
    try {
      const stored = JSON.parse(localStorage.getItem(`world-sim-chat-${worldId}`) || '[]');
      if (Array.isArray(stored) && stored.length > 0) useChatStore.getState().setMessages(stored);
    } catch { /* ignore */ }
    Promise.all([
      worldsApi.get(worldId),
      playerApi.get(worldId).catch(() => null),
      scenesApi.list(worldId).catch(() => ({ scenes: [] })),
      charactersApi.listByWorld(worldId).catch(() => []),
    ]).then(([w, p, s, chars]) => {
      setWorld(w);
      setPlayer(p);
      setScenes(s.scenes || []);
      const charList = Array.isArray(chars) ? chars : [];
      setCharacters(charList);
      setActiveCharacters(charList.map(c => c.id));
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
      const result = await eventsApi.propose(worldId, recentMessages, getApiConfig());
      if (result.proposal) {
        setPendingProposal(result.proposal);
      }
    } finally {
      setProposing(false);
    }
  }, [worldId, incrementTurns, shouldPropose, setProposing, setPendingProposal, getApiConfig]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar — barely visible */}
      <header className="flex items-center gap-4 px-6 py-2.5 border-b border-ink/8">
        <h1 className="text-sm font-medium flex-1 truncate">{world?.name}</h1>
        <select
          className="bg-transparent text-xs text-ink/50 focus:outline-none cursor-pointer"
          value={narrativeMode}
          onChange={(e) => setNarrativeMode(e.target.value)}
        >
          {NARRATIVE_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <Link to={`/world/${worldId}/archive`} className="text-xs text-ink/40 hover:text-ink/70 transition-colors">
          档案
        </Link>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — quiet */}
        <aside className="w-48 border-r border-ink/8 flex flex-col py-4 px-3 gap-3">
          <div>
            <p className="text-[10px] text-ink/30 uppercase tracking-wider mb-1">场景</p>
            <p className="text-xs text-ink/60 truncate">{player?.status?.current_location || '未知'}</p>
          </div>

          <div className="flex-1" />

          <CharacterSelector
            characters={characters}
            active={activeCharacters}
            onChange={setActiveCharacters}
          />

          <div className="flex flex-col gap-0.5 text-xs text-ink/40">
            <button className="text-left hover:text-ink/70 transition-colors py-0.5" onClick={() => setShowMap(true)}>地图</button>
            <button className="text-left hover:text-ink/70 transition-colors py-0.5" onClick={() => setShowProfile(true)}>状态</button>
            <button className="text-left hover:text-ink/70 transition-colors py-0.5" onClick={() => setShowInventory(true)}>背包</button>
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
            tokenBudget={tokenBudget}
            characters={characters}
            activeCharacters={activeCharacters}
            apiConfig={getApiConfig()}
          />
          {pendingProposal && (
            <div className="absolute bottom-16 left-6 right-6">
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
      {!loading && player && scenes !== null && scenes.length === 0 && (
        <InitScenesModal
          worldId={worldId}
          onCreated={(scene) => setScenes([scene])}
        />
      )}
    </div>
  );
}
