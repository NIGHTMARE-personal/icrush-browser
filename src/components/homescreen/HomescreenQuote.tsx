import { useState, useEffect, useCallback } from 'react';

interface Quote {
  text: string;
  author: string;
}

const quotes: Quote[] = [
  { text: "The impediment to action advances action. What stands in the way becomes the way.", author: "Marcus Aurelius" },
  { text: "We suffer more often in imagination than in reality.", author: "Seneca" },
  { text: "It is not what happens to you, but how you react to it that matters.", author: "Epictetus" },
  { text: "The happiness of your life depends upon the quality of your thoughts.", author: "Marcus Aurelius" },
  { text: "He who fears death will never do anything worth of a man who is alive.", author: "Seneca" },
  { text: "First say to yourself what you would be; and then do what you have to do.", author: "Epictetus" },
  { text: "The soul becomes dyed with the colour of its thoughts.", author: "Marcus Aurelius" },
  { text: "It is not that we have a short time to live, but that we waste a good deal of it.", author: "Seneca" },
  { text: "No man is free who is not master of himself.", author: "Epictetus" },
  { text: "Your time is limited, so don't waste it living someone else's life.", author: "Steve Jobs" },
  { text: "Stay hungry, stay foolish.", author: "Steve Jobs" },
  { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
  { text: "When something is important enough, you do it even if the odds are not in your favor.", author: "Elon Musk" },
  { text: "I think it is possible for ordinary people to choose to be extraordinary.", author: "Elon Musk" },
  { text: "Failure is an option here. If things are not failing, you are not innovating enough.", author: "Elon Musk" },
  { text: "The most dangerous phrase in the language is, we've always done it this way.", author: "Bill Gates" },
  { text: "I choose a lazy person to do a hard job. Because a lazy person will find an easy way to do it.", author: "Bill Gates" },
  { text: "We always overestimate the change that will occur in the next two years and underestimate the change that will occur in the next ten.", author: "Bill Gates" },
  { text: "Imagination is more important than knowledge.", author: "Albert Einstein" },
  { text: "Life is like riding a bicycle. To keep your balance, you must keep moving.", author: "Albert Einstein" },
  { text: "The important thing is not to stop questioning. Curiosity has its own reason for existing.", author: "Albert Einstein" },
  { text: "The first principle is that you must not fool yourself — and you are the easiest person to fool.", author: "Richard Feynman" },
  { text: "I would rather have questions that can't be answered than answers that can't be questioned.", author: "Richard Feynman" },
  { text: "Nothing in life is to be feared, it is only to be understood.", author: "Marie Curie" },
  { text: "Be less curious about people and more curious about ideas.", author: "Marie Curie" },
  { text: "There is nothing noble in being superior to your fellow man; true nobility is being superior to your former self.", author: "Ernest Hemingway" },
  { text: "The world breaks every one and afterward many are strong at the broken places.", author: "Ernest Hemingway" },
  { text: "In a time of deceit, telling the truth is a revolutionary act.", author: "George Orwell" },
  { text: "The only way to deal with an unfree world is to become so absolutely free that your very existence is an act of rebellion.", author: "Albert Camus" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Whenever you find yourself on the side of the majority, it is time to pause and reflect.", author: "Mark Twain" },
  { text: "Efficiency is doing things right; effectiveness is doing the right things.", author: "Peter Drucker" },
  { text: "The best way to predict the future is to create it.", author: "Peter Drucker" },
  { text: "Price is what you pay. Value is what you get.", author: "Warren Buffett" },
  { text: "It's far better to buy a wonderful company at a fair price than a fair company at a wonderful price.", author: "Warren Buffett" },
  { text: "Your margin is my opportunity.", author: "Warren Buffett" },
  { text: "We are stubborn on vision. We are flexible on details.", author: "Jeff Bezos" },
  { text: "If you double the number of experiments you do per year, you're going to double your inventiveness.", author: "Jeff Bezos" },
  { text: "I knew that if I failed I wouldn't regret that, but I knew the one thing I might regret is not trying.", author: "Jeff Bezos" },
  { text: "What we know is a drop, what we don't know is an ocean.", author: "Isaac Newton" },
];

const STORAGE_KEY_LAST_INDEX = 'icrush-quote-last-index';
const STORAGE_KEY_LAST_DATE = 'icrush-quote-last-date';

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

function getStoredDate(): string {
  return localStorage.getItem(STORAGE_KEY_LAST_DATE) || '';
}

function getStoredIndex(): number {
  const val = localStorage.getItem(STORAGE_KEY_LAST_INDEX);
  return val !== null ? parseInt(val, 10) : -1;
}

export function HomescreenQuote() {
  const [quoteIndex, setQuoteIndex] = useState(() => {
    const stored = getStoredIndex();
    if (stored >= 0 && getStoredDate() === new Date().toDateString()) {
      return stored;
    }
    return getDayOfYear() % quotes.length;
  });
  const [fade, setFade] = useState(true);

  const quote = quotes[quoteIndex];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_LAST_INDEX, quoteIndex.toString());
    localStorage.setItem(STORAGE_KEY_LAST_DATE, new Date().toDateString());
  }, [quoteIndex]);

  useEffect(() => {
    const interval = setInterval(() => {
      const today = new Date().toDateString();
      if (getStoredDate() !== today) {
        setFade(false);
        setTimeout(() => {
          const newIndex = getDayOfYear() % quotes.length;
          setQuoteIndex(newIndex);
          setFade(true);
        }, 300);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = useCallback(() => {
    setFade(false);
    setTimeout(() => {
      let newIndex: number;
      do {
        newIndex = Math.floor(Math.random() * quotes.length);
      } while (newIndex === quoteIndex && quotes.length > 1);
      setQuoteIndex(newIndex);
      setFade(true);
    }, 300);
  }, [quoteIndex]);

  return (
    <div className="homescreen-quote">
      <div className="quote-text" style={{ opacity: fade ? 1 : 0, transition: 'opacity 0.3s ease' }}>
        <span style={{
          position: 'absolute',
          top: '-10px',
          left: '-5px',
          fontSize: '72px',
          fontFamily: 'Georgia, serif',
          color: '#d4af37',
          opacity: 0.2,
          lineHeight: 1,
          userSelect: 'none',
          pointerEvents: 'none',
        }}>"</span>
        {quote.text}
      </div>
      <div className="quote-author" style={{ opacity: fade ? 1 : 0, transition: 'opacity 0.3s ease' }}>
        — {quote.author}
      </div>
      <button className="quote-refresh-btn" onClick={handleRefresh} title="New quote">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>
      <style>{`
        .homescreen-quote {
          position: relative;
          background: rgba(15,15,18,0.55);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 16px;
          padding: 24px;
          min-height: 120px;
          color: #f4f0ea;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .quote-text {
          position: relative;
          font-size: 14px;
          line-height: 1.6;
          font-style: italic;
          color: rgba(244,240,234,0.9);
          padding-left: 20px;
        }
        .quote-author {
          font-size: 12px;
          color: #d4af37;
          margin-top: 8px;
          padding-left: 20px;
        }
        .quote-refresh-btn {
          position: absolute;
          top: 12px;
          right: 12px;
          background: transparent;
          border: none;
          color: rgba(244,240,234,0.5);
          cursor: pointer;
          padding: 6px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s, background 0.2s;
        }
        .quote-refresh-btn:hover {
          color: #d4af37;
          background: rgba(212,175,55,0.1);
        }
      `}</style>
    </div>
  );
}
