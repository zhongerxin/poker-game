import { useRef, useState } from 'react';
import { ArrowUp, Check, LoaderCircle, RotateCcw, X } from 'lucide-react';
import { useOpenAiGlobal } from '../hooks/useOpenAi';
import { buildActionPrompt, clampRaise, getContextKey, type BettingContext, type PokerAction, type RaiseBounds } from '../lib/pokerActions';

type Props = { context: BettingContext; bounds: RaiseBounds | null; pot: number; canBet: boolean };

export function BettingActions({ context, bounds, pot, canBet }: Props) {
  const widgetState = useOpenAiGlobal('widgetState');
  const contextKey = getContextKey(context);
  const persisted = widgetState?.pokerAction as { contextKey?: string; label?: string } | undefined;
  const [sentLabel, setSentLabel] = useState<string | null>(
    persisted?.contextKey === contextKey && typeof persisted.label === 'string' ? persisted.label : null,
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(bounds?.min ?? 0);
  const busy = useRef(false);
  const supported = typeof window.openai?.sendFollowUpMessage === 'function';
  const disabled = !supported || !canBet || sending || Boolean(sentLabel);
  const amount = bounds ? clampRaise(selectedAmount, bounds) : 0;
  const format = (value: number) => value.toLocaleString('en-US');

  const persistSelection = async (label: string | null) => {
    try {
      await window.openai?.setWidgetState?.({
        ...window.openai.widgetState,
        pokerAction: label ? { contextKey, label } : null,
      });
    } catch {
      console.warn('Could not persist the poker action selection');
    }
  };

  const sendAction = async (action: PokerAction, label: string) => {
    if (busy.current || disabled) return;
    busy.current = true;
    setSending(true);
    setError(false);
    try {
      await window.openai.sendFollowUpMessage({ prompt: buildActionPrompt(action, context) });
    } catch {
      setError(true);
      busy.current = false;
      setSending(false);
      return;
    }
    setSentLabel(label);
    setSending(false);
    setExpanded(false);
    await persistSelection(label);
    busy.current = false;
  };

  const raise = () => {
    if (bounds) void sendAction({ type: 'raise', amount }, `Raise ${format(amount)}`);
  };
  const selectAmount = (value: number) => {
    if (bounds) setSelectedAmount(clampRaise(value, bounds));
  };

  return (
    <section className="betting-controls" aria-label="Poker actions" aria-busy={sending}>
      {bounds && (
        <div
          id="raise-controls"
          className={`raise-reveal${expanded ? ' is-expanded' : ''}`}
          aria-hidden={!expanded}
          inert={!expanded}
        >
          <div className="raise-reveal__clip">
            <div className="raise-slider-row">
            <output className="raise-value" htmlFor="raise-amount"><ArrowUp aria-hidden="true" />{format(amount)}</output>
            <input
              id="raise-amount"
              className="raise-slider"
              type="range"
              aria-label="Raise amount"
              aria-valuetext={`${format(amount)} chips`}
              min={bounds.min}
              max={bounds.max}
              step={1}
              value={amount}
              disabled={disabled || !expanded}
              onChange={event => selectAmount(Number(event.target.value))}
            />
            <button type="button" className="raise-confirm" aria-label={`Raise to ${amount}`} disabled={disabled || !expanded} onClick={raise}>
              {sending ? <LoaderCircle className="action-spinner" /> : <ArrowUp />}
            </button>
            </div>
          </div>
        </div>
      )}
      {expanded && bounds ? (
          <div className="betting-row betting-row--presets">
            <button type="button" className="poker-action" disabled={disabled} onClick={() => selectAmount(amount + bounds.bigBlind)}>1 BB</button>
            <button type="button" className="poker-action" disabled={disabled} onClick={() => selectAmount(pot / 2)}>1/2 Pot</button>
            <button type="button" className="poker-action" disabled={disabled} onClick={() => selectAmount(pot)}>Pot</button>
            <button type="button" className="poker-action poker-action--icon" aria-label="Cancel raise" disabled={sending} onClick={() => setExpanded(false)}><X /></button>
          </div>
      ) : (
        <div className="betting-row">
          <button type="button" className="poker-action" disabled={disabled} onClick={() => void sendAction('fold', 'Fold')}>Fold</button>
          <button type="button" className="poker-action" disabled={disabled} onClick={() => void sendAction('check-call', 'Call')}>Call</button>
          <button type="button" className="poker-action" disabled={disabled || !bounds} onClick={raise}>Raise {bounds ? format(amount) : ''}</button>
          <button
            type="button"
            className="poker-action poker-action--icon"
            aria-label={sentLabel ? 'Next action after opponent replies' : 'Custom raise'}
            aria-expanded={false}
            aria-controls="raise-controls"
            disabled={!supported || !canBet || sending || (!sentLabel && !bounds)}
            onClick={() => {
              if (busy.current) return;
              if (sentLabel) {
                setSentLabel(null);
                void persistSelection(null);
              } else {
                setExpanded(true);
              }
            }}
          >
            {sending ? <LoaderCircle className="action-spinner" /> : sentLabel ? <RotateCcw /> : <ArrowUp />}
          </button>
        </div>
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {!supported ? 'Open in ChatGPT to play.' : !canBet ? 'No chips left to bet.' : sending ? 'Sending…' : sentLabel ? `${sentLabel} sent. Waiting for your opponent.` : ''}
      </div>
      {sentLabel && <span className="action-receipt" aria-hidden="true"><Check />{sentLabel}</span>}
      {error && <p role="alert" className="action-error">Couldn’t send. Try again.</p>}
    </section>
  );
}
