import { useState, useEffect, useRef, useCallback } from 'react';

interface TextToSpeechProps {
  isOpen: boolean;
  onClose: () => void;
  webview: Electron.WebviewTag | null;
}

interface TTSVoice {
  name: string;
  lang: string;
  localService: boolean;
  voiceURI: string;
}

const splitSentences = (text: string): string[] =>
  text.replace(/([.!?])\s+/g, '$1|').split('|').map(s => s.trim()).filter(s => s.length > 0);

export function TextToSpeech({ isOpen, onClose, webview }: TextToSpeechProps) {
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [currentSentence, setCurrentSentence] = useState('');
  const [fullText, setFullText] = useState('');
  const [sentences, setSentences] = useState<string[]>([]);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices().map(v => ({
        name: v.name, lang: v.lang, localService: v.localService, voiceURI: v.voiceURI,
      }));
      setVoices(available);
      if (!selectedVoice && available.length > 0) {
        const preferred = available.find(v => v.name.includes('Microsoft'))
          || available.find(v => v.name.includes('Google'))
          || available.find(v => v.lang.startsWith('en'))
          || available[0];
        if (preferred) setSelectedVoice(preferred.voiceURI);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = () => {}; };
  }, [selectedVoice]);

  const extractText = useCallback(async () => {
    if (!webview) return '';
    try {
      const text = await webview.executeJavaScript(`(() => {
        const root = document.querySelector('article,[role="main"],main,#content,.content,.post,.article') || document.body;
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode(n) { const p = n.parentElement; if (!p) return NodeFilter.FILTER_REJECT; if (['SCRIPT','STYLE','NOSCRIPT','IFRAME','OBJECT','NAV','HEADER','FOOTER'].includes(p.tagName) || p.closest('[aria-hidden="true"]')) return NodeFilter.FILTER_REJECT; return NodeFilter.FILTER_ACCEPT; }
        }); const t=[]; let nd; while(nd=w.nextNode()){const x=nd.textContent?.trim();if(x&&x.length>1)t.push(x);} return t.join(' ');
      })()`);
      return typeof text === 'string' ? text : '';
    } catch { return ''; }
  }, [webview]);

  const highlightSentence = useCallback(async (sentence: string) => {
    if (!webview || !sentence) return;
    try {
      await webview.executeJavaScript(`(() => {
        document.querySelectorAll('.icrush-tts-highlight').forEach(el=>{const p=el.parentNode;if(p){p.replaceChild(document.createTextNode(el.textContent||''),el);p.normalize();}});
        const re=new RegExp('${sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "\\'")}','gi');
        const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let nd;
        while(nd=w.nextNode()){if(nd.textContent&&re.test(nd.textContent)){const s=document.createElement('span');s.className='icrush-tts-highlight';s.style.cssText='background:rgba(212,175,55,0.3);color:inherit;border-radius:2px;transition:background 0.3s;';const p=nd.parentNode;if(p){p.replaceChild(s,nd);s.textContent=nd.textContent;s.scrollIntoView({behavior:"smooth",block:"center"});}break;}}
      })()`);
    } catch { /* ignore */ }
  }, [webview]);

  const clearHighlights = useCallback(async () => {
    if (!webview) return;
    try {
      await webview.executeJavaScript(`document.querySelectorAll('.icrush-tts-highlight').forEach(el=>{const p=el.parentNode;if(p){p.replaceChild(document.createTextNode(el.textContent||''),el);p.normalize();}});`);
    } catch { /* ignore */ }
  }, [webview]);

  const speakSentence = useCallback((index: number) => {
    if (index >= sentences.length) { setIsPlaying(false); setIsPaused(false); setProgress(100); clearHighlights(); return; }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(sentences[index]);
    const voice = voices.find(v => v.voiceURI === selectedVoice);
    if (voice) { utt.voice = window.speechSynthesis.getVoices().find(v => v.name === voice.name) || null; }
    utt.rate = speed;
    utt.onstart = () => { setCurrentSentence(sentences[index]); setSentenceIndex(index); highlightSentence(sentences[index]); };
    utt.onend = () => speakSentence(index + 1);
    utt.onerror = () => { setIsPlaying(false); setIsPaused(false); };
    utteranceRef.current = utt;
    window.speechSynthesis.speak(utt);
  }, [voices, selectedVoice, speed, sentences, highlightSentence, clearHighlights]);

  const handlePlay = useCallback(async () => {
    if (isPaused) { window.speechSynthesis.resume(); setIsPaused(false); setIsPlaying(true); return; }
    let text = fullText;
    if (!text) { text = await extractText(); if (!text) return; setFullText(text); }
    const sents = splitSentences(text);
    if (sents.length === 0) return;
    setSentences(sents); setIsPlaying(true); setIsPaused(false); setProgress(0); speakSentence(0);
  }, [isPaused, fullText, extractText, speakSentence]);

  const handlePause = () => { window.speechSynthesis.pause(); setIsPaused(true); setIsPlaying(false); };
  const handleStop = () => { window.speechSynthesis.cancel(); setIsPlaying(false); setIsPaused(false); setProgress(0); setSentenceIndex(0); setCurrentSentence(''); clearHighlights(); };
  const handleSkipBack = () => { const i = Math.max(0, sentenceIndex - 1); setSentenceIndex(i); if (isPlaying || isPaused) { setIsPaused(false); speakSentence(i); } };
  const handleSkipForward = () => { const i = Math.min(sentences.length - 1, sentenceIndex + 1); setSentenceIndex(i); if (isPlaying || isPaused) { setIsPaused(false); speakSentence(i); } };

  useEffect(() => { if (sentences.length > 0) setProgress(Math.round((sentenceIndex / sentences.length) * 100)); }, [sentenceIndex, sentences.length]);
  useEffect(() => () => { window.speechSynthesis.cancel(); clearHighlights(); }, [clearHighlights]);
  const handleClose = () => { handleStop(); onClose(); };

  if (!isOpen) return null;

  const sortedVoices = [...voices.filter(v => v.name.includes('Microsoft') || v.name.includes('Google') || v.lang.startsWith('en')), ...voices.filter(v => !v.name.includes('Microsoft') && !v.name.includes('Google') && !v.lang.startsWith('en'))];

  return (
    <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9500, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {isMinimized ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(15,15,20,0.95)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '9999px', padding: '8px 16px', cursor: 'pointer', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', backdropFilter: 'blur(16px)' }} onClick={() => setIsMinimized(false)}>
          <span style={{ fontSize: '14px' }}>{'>>>'}</span>
          {isPlaying && <div style={{ width: '40px', height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}><div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #d4af37, #C86D51)', borderRadius: '2px', transition: 'width 0.3s' }} /></div>}
          <button onClick={(e) => { e.stopPropagation(); isPlaying ? handlePause() : handlePlay(); }} style={{ background: 'none', border: 'none', color: '#d4af37', cursor: 'pointer', fontSize: '14px', padding: 0 }}>{isPaused ? '||' : '>'}</button>
          <button onClick={(e) => { e.stopPropagation(); handleClose(); }} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '12px', padding: 0 }}>x</button>
        </div>
      ) : (
        <div style={{ background: 'rgba(15,15,20,0.97)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', boxShadow: '0 12px 48px rgba(0,0,0,0.7)', backdropFilter: 'blur(20px)', overflow: 'hidden', width: '400px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f3f4f6' }}>Read Aloud</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setShowSettings(!showSettings)} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#9ca3af', cursor: 'pointer', borderRadius: '6px', padding: '4px 8px', fontSize: '11px' }}>Settings</button>
              <button onClick={() => setIsMinimized(true)} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#9ca3af', cursor: 'pointer', borderRadius: '6px', padding: '4px 8px', fontSize: '11px' }}>Minimize</button>
              <button onClick={handleClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#9ca3af', cursor: 'pointer', borderRadius: '6px', padding: '4px 8px', fontSize: '11px' }}>Close</button>
            </div>
          </div>

          {showSettings && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>Voice</label>
                <select value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#e5e7eb', padding: '6px 8px', fontSize: '12px' }}>
                  {sortedVoices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>Speed<span style={{ color: '#d4af37' }}>{speed.toFixed(1)}x</span></label>
                <input type="range" min="0.5" max="2" step="0.1" value={speed} onChange={e => setSpeed(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#d4af37' }} />
              </div>
            </div>
          )}

          <div style={{ padding: '12px 16px' }}>
            <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden', marginBottom: '12px' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #d4af37, #C86D51)', borderRadius: '2px', transition: 'width 0.3s' }} />
            </div>
            {currentSentence && <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '12px', lineHeight: 1.4, maxHeight: '40px', overflow: 'hidden' }}>{currentSentence}</div>}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
              <button onClick={handleSkipBack} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#e5e7eb', cursor: 'pointer', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>{'<<'}</button>
              <button onClick={() => isPlaying ? handlePause() : handlePlay()} style={{ background: 'linear-gradient(135deg, #d4af37, #C86D51)', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', boxShadow: '0 4px 16px rgba(212,175,55,0.3)' }}>{isPaused ? '||' : '>'}</button>
              <button onClick={handleStop} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#e5e7eb', cursor: 'pointer', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>{'[]'}</button>
              <button onClick={handleSkipForward} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#e5e7eb', cursor: 'pointer', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>{'>>'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
