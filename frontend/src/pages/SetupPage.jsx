import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { worldsApi } from '../api/worlds.js';
import { useSettingsStore } from '../stores/settingsStore.js';
import ProtagonistBioStep from '../components/setup/ProtagonistBioStep.jsx';
import CoreNpcStep from '../components/setup/CoreNpcStep.jsx';
import BulkGenerateStep from '../components/setup/BulkGenerateStep.jsx';
import Spinner from '../components/ui/Spinner.jsx';

const STEP_LABELS = ['主角小传', '核心人物', '生成世界内容'];

export default function SetupPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const { getApiConfig } = useSettingsStore();

  const [world, setWorld] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0); // 0=bio, 1=core npcs, 2=bulk generate
  const [protagonistBio, setProtagonistBio] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [coreNpcSuggestions, setCoreNpcSuggestions] = useState([]);
  const [createdCoreNpcs, setCreatedCoreNpcs] = useState([]);

  useEffect(() => {
    worldsApi.get(worldId)
      .then(setWorld)
      .finally(() => setLoading(false));
  }, [worldId]);

  async function handleFinish() {
    try {
      await worldsApi.update(worldId, { ...world, onboarding_complete: true });
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
          <ProtagonistBioStep
            bio={protagonistBio}
            onBioChange={setProtagonistBio}
            playerName={playerName}
            onPlayerNameChange={setPlayerName}
            worldContext={world}
            worldId={worldId}
            apiConfig={getApiConfig()}
            onComplete={(suggestions) => {
              setCoreNpcSuggestions(suggestions);
              setStep(1);
            }}
          />
        )}
        {step === 1 && (
          <CoreNpcStep
            suggestions={coreNpcSuggestions}
            worldId={worldId}
            worldContext={world}
            playerName={playerName}
            protagonistBio={protagonistBio}
            apiConfig={getApiConfig()}
            onComplete={(npcs) => {
              setCreatedCoreNpcs(npcs);
              setStep(2);
            }}
          />
        )}
        {step === 2 && (
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
