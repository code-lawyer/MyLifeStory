import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { relationshipsApi } from '../api/relationships.js';
import MapPanel from '../components/panels/MapPanel.jsx';
import PlayerProfilePanel from '../components/panels/PlayerProfilePanel.jsx';
import InventoryPanel from '../components/panels/InventoryPanel.jsx';
import CharacterProfilePanel from '../components/panels/CharacterProfilePanel.jsx';
import EventLogPanel from '../components/panels/EventLogPanel.jsx';
import { entryId } from '../utils/scene-utils.js';
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
  const [relationships, setRelationships] = useState({});
  const [events, setEvents] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentScene, setCurrentScene] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showEventLog, setShowEventLog] = useState(false);
  const [profileCharacter, setProfileCharacter] = useState(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const { tokenBudget, apiUrl, apiKey, model } = useSettingsStore();
  const apiConfig = useMemo(() => ({ apiUrl, apiKey, model }), [apiUrl, apiKey, model]);
  const narrativeMode = world?.narrative_mode || 'ensemble';
  const {
    pendingProposal, setPendingProposal, clearProposal,
    incrementTurns, setProposing,
  } = useEventStore();

  const { clearBlocks } = useChatStore();
  const chatBlocks = useChatStore((s) => s.blocks);
  const chatStreaming = useChatStore((s) => s.streaming);

  useEffect(() => {
    useChatStore.getState().clearBlocks();
    try {
      const stored = JSON.parse(localStorage.getItem(`world-sim-chat-${worldId}`) || '[]');
      if (Array.isArray(stored) && stored.length > 0 && stored[0]?.messages) {
        useChatStore.getState().setBlocks(stored);
      }
    } catch { /* ignore */ }
    Promise.all([
      worldsApi.get(worldId),
      playerApi.get(worldId).catch(() => null),
      scenesApi.list(worldId).catch(() => ({ scenes: [] })),
      charactersApi.listByWorld(worldId).catch(() => []),
      relationshipsApi.get(worldId).catch(() => ({ relationships: {} })),
      eventsApi.list(worldId).catch(() => ({ events: [], summaries: [] })),
    ]).then(([w, p, s, chars, rels, evts]) => {
      setWorld(w);
      setPlayer(p);
      const sceneList = s.scenes || [];
      setScenes(sceneList);
      if (p?.status?.current_location) {
        setCurrentScene(sceneList.find(sc => sc.id === p.status.current_location) || null);
      }
      const charList = Array.isArray(chars) ? chars : [];
      setCharacters(charList);
      setRelationships(rels.relationships || {});
      setEvents(evts.events || []);
      setSummaries(evts.summaries || []);
      if (charList.length > 0) setSelectedCharacterId(charList[0].id);
    }).finally(() => setLoading(false));
  }, [worldId]);

  useEffect(() => {
    if (world && world.onboarding_complete === false) {
      navigate(`/world/${worldId}/setup`, { replace: true });
    }
  }, [world, worldId, navigate]);

  useEffect(() => {
    if (chatBlocks.length === 0 || chatStreaming) return;
    try {
      localStorage.setItem(`world-sim-chat-${worldId}`, JSON.stringify(chatBlocks));
    } catch { /* ignore quota */ }
  }, [worldId, chatBlocks, chatStreaming]);

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

    // Fire-and-forget: update world narrative summary
    worldsApi.narrate(worldId, eventDraft, apiConfig)
      .then((narratedWorld) => { if (mountedRef.current) setWorld(narratedWorld); })
      .catch((err) => console.warn('[WorldPage] narrate failed:', err.message));

    // Fire-and-forget: update affected NPC statuses
    const activeCharacterIds = visibleCharacters.map(c => c.id);
    worldsApi.npcDrift(worldId, eventDraft, activeCharacterIds, apiConfig)
      .then(({ updated }) => {
        if (!mountedRef.current || updated.length === 0) return;
        setCharacters(prev => prev.map(c => {
          const upd = updated.find(u => u.id === c.id);
          return upd ? { ...c, current_state: upd.current_state } : c;
        }));
      })
      .catch((err) => console.warn('[WorldPage] npc-drift failed:', err.message));

    // Fire-and-forget: update player status if event affects player
    if (eventDraft.affected_characters?.includes('__player__')) {
      playerApi.drift(worldId, eventDraft, apiConfig)
        .then(({ player: updatedPlayer }) => { if (mountedRef.current) setPlayer(updatedPlayer); })
        .catch((err) => console.warn('[WorldPage] player-drift failed:', err.message));
    }

    // Add event to local state
    const newEvent = { ...eventDraft, confirmed_by_user: true };
    const updatedEvents = [...events, newEvent];
    setEvents(updatedEvents);

    // Auto-compress when non-major events reach 10
    const nonMajorCount = updatedEvents.filter(e => e.impact_scope !== 'major').length;
    if (nonMajorCount >= 10) {
      try {
        await eventsApi.compress(worldId, apiConfig);
        const fresh = await eventsApi.list(worldId).catch(() => ({ events: [], summaries: [] }));
        setEvents(fresh.events || []);
        setSummaries(fresh.summaries || []);
      } catch (err) {
        console.warn('[WorldPage] auto-compress failed:', err.message);
      }
    }
  }

  function handleSceneEnter(result) {
    const scene = { ...result.scene, characters_present: result.characters_present || result.scene.characters_present || [] };
    setCurrentScene(scene);
    setSelectedCharacterId(null);
    clearBlocks();
    setPlayer((prev) => prev ? { ...prev, status: { ...prev.status, current_location: scene.id } } : prev);
  }

  const handleTurnComplete = useCallback(async () => {
    incrementTurns();
    if (!useEventStore.getState().shouldPropose()) return;
    setProposing(true);
    try {
      const recentMessages = useChatStore.getState().getAllMessages().slice(-10).filter(m => m.content);
      if (recentMessages.length === 0) return;
      const activeCharacters = characters.map(c => ({ id: c.id, name: c.name }));
      const result = await eventsApi.propose(worldId, recentMessages, activeCharacters, apiConfig);
      if (result.proposal) {
        setPendingProposal(result.proposal);
      }
    } finally {
      setProposing(false);
    }

    // Familiarity evaluation (fire-and-forget)
    if (selectedCharacterId) {
      const charBlocks = useChatStore.getState().blocks.filter(b => b.characterId === selectedCharacterId);
      const lastBlock = charBlocks[charBlocks.length - 1];
      if (lastBlock) {
        const recentMsgs = lastBlock.messages.slice(-3);
        relationshipsApi.evaluate(worldId, selectedCharacterId, recentMsgs, apiConfig)
          .then((result) => {
            setRelationships(prev => ({
              ...prev,
              [selectedCharacterId]: {
                ...(prev[selectedCharacterId] || {}),
                familiarity: result.familiarity,
                last_interaction: new Date().toISOString(),
              },
            }));
          })
          .catch((err) => console.warn('[WorldPage] familiarity evaluate failed:', err.message));
      }
    }
  }, [worldId, selectedCharacterId, incrementTurns, setProposing, setPendingProposal, apiConfig, characters]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  }

  const scenePresent = currentScene?.characters_present || [];
  const sceneCharacterIds = new Set(scenePresent.map(entryId));
  const visibleCharacters = currentScene
    ? characters.filter(c => {
        if (c.home_scene === currentScene.id) return true;
        if (c.tier === 'legendary' || c.tier === 'elite') return sceneCharacterIds.has(c.id);
        return false;
      })
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
            onInfo={setProfileCharacter}
            relationships={relationships}
          />

          <div className="flex flex-col gap-0.5 text-xs text-ink/40">
            <button className="text-left hover:text-ink/70 transition-colors py-0.5" onClick={() => setShowMap(true)}>地图</button>
            <button className="text-left hover:text-ink/70 transition-colors py-0.5" onClick={() => setShowProfile(true)}>状态</button>
            <button className="text-left hover:text-ink/70 transition-colors py-0.5" onClick={() => setShowInventory(true)}>背包</button>
            <button className="text-left hover:text-ink/70 transition-colors py-0.5" onClick={() => setShowEventLog(true)}>事件</button>
          </div>
        </aside>

        {/* Chat pane */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <ChatPane
            worldId={worldId}
            worldData={world}
            playerStatus={player?.status}
            currentScene={currentScene}
            narrativeMode={narrativeMode}
            onTurnComplete={handleTurnComplete}
            tokenBudget={tokenBudget}
            characters={characters}
            activeCharacterId={selectedCharacterId}
            apiConfig={apiConfig}
            eventLog={events}
            archivedSummaries={summaries}
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
      {showEventLog && <EventLogPanel events={events} summaries={summaries} onClose={() => setShowEventLog(false)} />}
      {profileCharacter && (
        <CharacterProfilePanel
          character={profileCharacter}
          relationship={relationships[profileCharacter.id] || {}}
          currentScene={currentScene}
          onClose={() => setProfileCharacter(null)}
        />
      )}
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
