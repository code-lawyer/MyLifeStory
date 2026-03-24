import { TIER_LABELS, TIER_DOTS } from '../../constants/tiers.js';
import { getFamiliarityLabel, DARK_TEASER_THRESHOLD } from '../../constants/familiarity.js';
import { entryId, entryRole } from '../../utils/scene-utils.js';
import SlidePanel from './SlidePanel.jsx';

export default function CharacterProfilePanel({ character, relationship = {}, currentScene, onClose }) {
  if (!character) return null;

  const fam = relationship.familiarity || 0;
  const dot = TIER_DOTS[character.tier] || '';
  const tierLabel = TIER_LABELS[character.tier] || character.tier || '';

  const scenePresent = currentScene?.characters_present || [];
  const sceneEntry = scenePresent.find(p => entryId(p) === character.id);
  const sceneRole = sceneEntry ? entryRole(sceneEntry) : null;

  const darkRevealed = relationship.dark_revealed;

  return (
    <SlidePanel title={`${dot ? dot + ' ' : ''}${character.name}`} onClose={onClose}>
      <div className="space-y-5">

        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-ink/30 uppercase tracking-wider">{tierLabel}</span>
          {sceneRole && (
            <p className="text-xs text-ink/50 italic">"{sceneRole}"</p>
          )}
        </div>

        {(character.identity?.description || character.identity?.personality) && (
          <div className="space-y-2">
            {character.identity?.description && (
              <div>
                <p className="text-[10px] text-ink/30 uppercase tracking-wider mb-1">简介</p>
                <p className="text-sm text-ink/70 leading-relaxed">{character.identity.description}</p>
              </div>
            )}
            {character.identity?.personality && (
              <div>
                <p className="text-[10px] text-ink/30 uppercase tracking-wider mb-1">性格</p>
                <p className="text-sm text-ink/60 leading-relaxed">{character.identity.personality}</p>
              </div>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] text-ink/30 uppercase tracking-wider">熟悉度</p>
            <span className="text-xs text-ink/50">{getFamiliarityLabel(fam)} · {fam}</span>
          </div>
          <div className="h-1 bg-ink/8 rounded-full overflow-hidden">
            <div
              className="h-full bg-ink/30 rounded-full transition-all duration-500"
              style={{ width: `${fam}%` }}
            />
          </div>
        </div>

        {darkRevealed && (
          <div className="border border-red-200/40 rounded-lg p-3 space-y-2 bg-red-50/20">
            <p className="text-[10px] text-red-400/70 uppercase tracking-wider">隐秘面</p>
            {relationship.dark_personality && (
              <p className="text-sm text-ink/60 leading-relaxed">{relationship.dark_personality}</p>
            )}
            {relationship.dark_motivation && (
              <p className="text-xs text-ink/40 italic mt-1">{relationship.dark_motivation}</p>
            )}
          </div>
        )}

        {!darkRevealed && fam >= DARK_TEASER_THRESHOLD && (
          <p className="text-[10px] text-ink/25 italic text-center">感觉此人另有隐情…</p>
        )}

      </div>
    </SlidePanel>
  );
}
