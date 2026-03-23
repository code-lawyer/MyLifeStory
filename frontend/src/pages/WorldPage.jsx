import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { worldsApi } from '../api/worlds.js';
import { playerApi } from '../api/player.js';
import { eventsApi } from '../api/events.js';
import { scenesApi } from '../api/scenes.js';
import { useEventStore } from '../stores/eventStore.js';

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

const NARRATIVE_MODE_LABELS = { intimate: '亲密', ensemble: '群像', epic: '史诗' };

export default function WorldPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const [world, setWorld] = useState(null);
  const [player, setPlayer] = useState(null);
  const [scenes, setScenes] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentScene, setCurrentScene] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showInventory, setShowInventory] = useState(false);

  const { tokenBudget, apiUrl, apiKey, model } = useSettingsStore();
  const apiConfig = useMemo(() => ({ apiUrl, apiKey, model }), [apiUrl, apiKey, model]);
  const narrativeMode = world?.narrative_mode || 'ensemble';
  const {
    pendingProposal, setPendingProposal, clearProposal,
    incrementTurns, setProposing,
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
      const sceneList = s.scenes || [];
      setScenes(sceneList);
      if (p?.status?.current_location) {
        setCurrentScene(sceneList.find(sc => sc.id === p.status.current_location) || null);
      }
      const charList = Array.isArray(chars) ? chars : [];
      setCharacters(charList);
      if (charList.length > 0) setSelectedCharacterId(charList[0].id);
    }).finally(() => setLoading(false));
  }, [worldId]);

  useEffect(() => {
    if (world && world.onboarding_complete === false) {
      navigate(`/world/${worldId}/setup`, { replace: true });
    }
  }, [world, worldId, navigate]);

  useEffect(() => {
    if (chatMessages.length === 0 || chatStreaming) return;
    try {
      localStorage.setItem(`world-sim-chat-${worldId}`, JSON.stringify(chatMessages));
    } catch { /* ignore quota */ }
  }, [worldId, chatMessages, chatStreaming]);

  async function handleEventAccepted(eventDraft) {
    if (eventDraft.inventory_add) {
      for (const item of eventDraft.inventory_add) {
        try { await playerApi.addItem(worldId, item); } catch { /* ignore */ }
      }
    }
    if (eventDraft.inventory_remove) {
      for (const itemId of eventDraft.inventory_remove) {
        try { await playerApi.deleteItem(worldId, itemId); } catch { /* ignore */ }
      }
    }
    const [freshPlayer, freshWorld] = await Promise.all([
      playerApi.get(worldId).catch(() => null),
      worldsApi.get(worldId).catch(() => null),
    ]);
    if (freshPlayer) setPlayer(freshPlayer);
    if (freshWorld) setWorld(freshWorld);
  }

  function handleSceneEnter(result) {
    setCurrentScene(result.scene);
    setSelectedCharacterId(null);
    setPlayer((prev) => prev ? { ...prev, status: { ...prev.status, current_location: result.scene.id } } : prev);
  }

  const handleTurnComplete = useCallback(async () => {
    incrementTurns();
    if (!useEventStore.getState().shouldPropose()) return;
    setProposing(true);
    try {
      const recentMessages = chatMessagesRef.current.slice(-10).filter(m => m.content);
      if (recentMessages.length === 0) return;
      const result = await eventsApi.propose(worldId, recentMessages, apiConfig);
      if (result.proposal) {
        setPendingProposal(result.proposal);
      }
    } finally {
      setProposing(false);
    }
  }, [worldId, incrementTurns, setProposing, setPendingProposal, apiConfig]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  }

  const sceneCharacterIds = currentScene?.characters_present || [];
  const visibleCharacters = sceneCharacterIds.length > 0
    ? characters.filter(c => sceneCharacterIds.includes(c.id))
    : characters.filter(c => c.tier === 'legendary' || c.tier === 'elite');

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar — barely visible */}
      <header className="flex items-center gap-4 px-6 py-2.5 border-b border-ink/8">
        <button
          onClick={() => navigate('/')}
          className="text-xs text-ink/40 hover:text-ink/70 transition-colors"
        >
          ← 返回
        </button>
        <h1 className="text-sm font-medium flex-1 truncate">{world?.name}</h1>
        <span className="text-xs text-ink/40">{NARRATIVE_MODE_LABELS[narrativeMode] || '群像'}模式</span>
        <Link to={`/world/${worldId}/archive`} className="text-xs text-ink/40 hover:text-ink/70 transition-colors">
          档案
        </Link>
        <button
          onClick={async () => {
            if (!window.confirm(`确认删除「${world?.name}」？此操作不可恢复。`)) return;
            try {
              await worldsApi.delete(worldId);
              navigate('/', { replace: true });
            } catch {
              alert('删除失败');
            }
          }}
          className="text-xs text-red-400 hover:text-red-600 transition-colors"
        >
          删除世界
        </button>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — quiet */}
        <aside className="w-48 border-r border-ink/8 flex flex-col py-4 px-3 gap-3">
          <div>
            <p className="text-[10px] text-ink/30 uppercase tracking-wider mb-1">场景</p>
            <p className="text-xs text-ink/60 truncate">{currentScene?.name || player?.status?.current_location || '未知'}</p>
          </div>

          <div className="flex-1" />

          <CharacterSelector
            characters={visibleCharacters}
            selectedId={selectedCharacterId}
            onSelect={setSelectedCharacterId}
          />

          <div className="flex flex-col gap-0.5 text-xs text-ink/40">
            <button className="text-left hover:text-ink/70 transition-colors py-0.5" onClick={() => setShowMap(true)}>地图</button>
            <button className="text-left hover:text-ink/70 transition-colors py-0.5" onClick={() => setShowProfile(true)}>状态</button>
            <button className="text-left hover:text-ink/70 transition-colors py-0.5" onClick={() => setShowInventory(true)}>背包</button>
          </div>
        </aside>

        {/* Chat pane */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {selectedCharacterId && (
            <div className="px-4 py-1.5 border-b border-ink/8 bg-white/40">
              <p className="text-xs text-ink/50">
                你正在和 <span className="font-medium text-ink/70">{characters.find(c => c.id === selectedCharacterId)?.name}</span> 对话
              </p>
            </div>
          )}
          <ChatPane
            worldId={worldId}
            worldData={world}
            playerStatus={player?.status}
            currentScene={currentScene}
            narrativeMode={narrativeMode}
            onTurnComplete={handleTurnComplete}
            tokenBudget={tokenBudget}
            characters={characters}
            activeCharacters={selectedCharacterId ? [selectedCharacterId] : []}
            apiConfig={apiConfig}
          />
          {pendingProposal && (
            <div className="absolute bottom-16 left-6 right-6">
              <EventProposalCard
                worldId={worldId}
                proposal={pendingProposal}
                onDismiss={clearProposal}
                onAccepted={handleEventAccepted}
                apiConfig={apiConfig}
              />
            </div>
          )}
        </div>
      </div>

      {/* Overlay panels */}
      {showMap && <MapPanel worldId={worldId} scenes={scenes || []} onClose={() => setShowMap(false)} onEnter={handleSceneEnter} />}
      {showProfile && <PlayerProfilePanel worldId={worldId} player={player} onClose={() => setShowProfile(false)} onUpdate={(updated) => setPlayer(updated)} />}
      {showInventory && <InventoryPanel worldId={worldId} inventory={player?.inventory || []} onClose={() => setShowInventory(false)} onUpdate={(inv) => setPlayer((p) => p ? { ...p, inventory: inv } : p)} />}
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
