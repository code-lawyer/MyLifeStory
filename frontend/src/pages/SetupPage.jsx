import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { worldsApi } from '../api/worlds.js';
import { useSettingsStore } from '../stores/settingsStore.js';
import NarrativeModeStep from '../components/setup/NarrativeModeStep.jsx';
import ProtagonistBioStep from '../components/setup/ProtagonistBioStep.jsx';
import CoreNpcStep from '../components/setup/CoreNpcStep.jsx';
import BulkGenerateStep from '../components/setup/BulkGenerateStep.jsx';
import Spinner from '../components/ui/Spinner.jsx';

const STEP_LABELS = ['叙事模式', '主角小传', '核心人物', '生成世界内容'];

export default function SetupPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const { getApiConfig } = useSettingsStore();

  const [world, setWorld] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0); // 0=mode, 1=bio, 2=core npcs, 3=bulk generate
  const [narrativeMode, setNarrativeMode] = useState('ensemble');
  const [protagonistBio, setProtagonistBio] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [coreNpcResult, setCoreNpcResult] = useState(null);
  const [createdCoreNpcs, setCreatedCoreNpcs] = useState([]);

  useEffect(() => {
    worldsApi.get(worldId)
      .then(setWorld)
      .catch((err) => console.error('Failed to load world for setup:', err))
      .finally(() => setLoading(false));
  }, [worldId]);

  async function handleFinish() {
    try {
      await worldsApi.update(worldId, { ...world, narrative_mode: narrativeMode, onboarding_complete: true });
    } catch { /* non-blocking */ }
    navigate(`/world/${worldId}`, { replace: true });
  }

  if (loading) return <div className="min-h-screen bg-parchment flex items-center justify-center"><Spinner /></div>;
  if (!world) return <div className="min-h-screen bg-parchment p-10"><p className="text-ink/50">世界未找到</p></div>;

  return (
    <div className="min-h-screen bg-parchment">
      <header className="border-b border-ink/8 px-10 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-base font-semibold text-ink">{world.name} — 初始设定</h1>
          <div className="flex gap-2">
            {STEP_LABELS.map((label, i) => (
              <span
                key={i}
                className={`text-xs px-2 py-1 rounded ${
                  i === step ? 'bg-ink/10 text-ink' : i < step ? 'text-ink/40' : 'text-ink/20'
                }`}
              >
                {i + 1}. {label}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-10 py-10">
        {step === 0 && (
          <NarrativeModeStep
            value={narrativeMode}
            onChange={setNarrativeMode}
            onComplete={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <ProtagonistBioStep
            bio={protagonistBio}
            onBioChange={setProtagonistBio}
            playerName={playerName}
            onPlayerNameChange={setPlayerName}
            worldContext={world}
            worldId={worldId}
            apiConfig={getApiConfig()}
            onComplete={(result) => {
              setCoreNpcResult(result);
              setStep(2);
            }}
          />
        )}
        {step === 2 && (
          <CoreNpcStep
            protagonistNpcs={coreNpcResult?.protagonistNpcs || []}
            worldNpcs={coreNpcResult?.worldNpcs || []}
            worldId={worldId}
            worldContext={world}
            playerName={playerName}
            protagonistBio={protagonistBio}
            apiConfig={getApiConfig()}
            onComplete={(npcs) => {
              setCreatedCoreNpcs(npcs);
              setStep(3);
            }}
          />
        )}
        {step === 3 && (
          <BulkGenerateStep
            worldId={worldId}
            worldContext={world}
            scale={world.scale || 'small'}
            apiConfig={getApiConfig()}
            onComplete={handleFinish}
          />
        )}
      </main>
    </div>
  );
}
