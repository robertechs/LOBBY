'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import styles from './page.module.css';
import DocsModal from '../components/DocsModal';

interface CycleData {
  cycleNumber: number;
  heatLevel: number;
  timeLeftMs: number;
  tankSol: number;
  tankUsd?: number;
  participants: number;
  alphaClaw: { wallet: string; tokenBalance?: number; tokenBalanceFormatted?: string; position?: number; } | null;
  // Legacy
  roundNumber?: number;
  potSizeSol?: number;
  champion?: { wallet: string; totalBought: number; } | null;
}

interface LeaderboardEntry {
  rank: number;
  wallet: string;
  walletShort: string;
  tokenBalance?: number;
  tokenBalanceFormatted?: string;
  totalBoughtSol?: number; // Legacy
}

interface CycleHistory {
  cycleNumber: number;
  alphaWallet: string | null;
  alphaExtraction: number;
  shatterAmount: number;
  totalTankSol: number;
  participants: number;
  // Legacy
  roundNumber?: number;
  championWallet?: string | null;
  championPayout?: number;
  buybackAmount?: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function Home() {
  const [cycleData, setCycleData] = useState<CycleData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lastCycle, setLastCycle] = useState<CycleHistory | null>(null);
  const [showWinner, setShowWinner] = useState(false);
  const prevCycleRef = useRef<number>(0);
  const hasShownMoltdownRef = useRef<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [heatLevel, setHeatLevel] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isDocsOpen, setIsDocsOpen] = useState(false);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cycleRes, leaderboardRes, historyRes] = await Promise.all([
          fetch(`${API_URL}/api/protocol/status`),
          fetch(`${API_URL}/api/leaderboard?limit=10`),
          fetch(`${API_URL}/api/protocol/history?limit=10`),
        ]);

        if (cycleRes.ok) {
          const data = await cycleRes.json();
          setCycleData(prev => ({
            ...data,
            tankSol: data.tankSol > 0 ? data.tankSol : (prev?.tankSol || data.potSizeSol || 0),
          }));
          setHeatLevel(data.heatLevel || 0);
          setTimeLeft(Math.floor((data.timeLeftMs || 60000) / 1000));
        }

        if (leaderboardRes.ok) {
          const data = await leaderboardRes.json();
          if (data.leaderboard) setLeaderboard(data.leaderboard);
        }

        if (historyRes.ok) {
          const data = await historyRes.json();
          const cycles = data.cycles || data.rounds || [];
          if (cycles.length > 0) {
            const completedCycles = cycles.filter((c: CycleHistory) => 
              c.alphaWallet || c.championWallet
            );
            
            if (completedCycles.length > 0) {
              const latest = completedCycles[0];
              setLastCycle(latest);
              
              const cycleNum = latest.cycleNumber || latest.roundNumber;
              if (prevCycleRef.current > 0 && cycleNum !== prevCycleRef.current) {
                setShowWinner(true);
                setTimeout(() => setShowWinner(false), 15000);
              }
              prevCycleRef.current = cycleNum;
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 1500);
    return () => clearInterval(interval);
  }, []);

  // Local timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
      setHeatLevel(prev => Math.min(100, prev + (100 / 60)));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Show popup when heat reaches 100%
  useEffect(() => {
    if (heatLevel >= 100 && !hasShownMoltdownRef.current && !showWinner) {
      hasShownMoltdownRef.current = true;
      setShowWinner(true);
      setTimeout(() => {
        setShowWinner(false);
        // Reset timer for next cycle
        setHeatLevel(0);
        setTimeLeft(60);
        hasShownMoltdownRef.current = false;
      }, 5000);
    }
  }, [heatLevel, showWinner]);

  const formatWallet = (wallet: string | undefined | null) => {
    if (!wallet) return '—';
    return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
  };

  const getHeatColor = (level: number) => {
    if (level < 30) return 'var(--heat-cool)';
    if (level < 60) return 'var(--heat-warm)';
    if (level < 85) return 'var(--heat-hot)';
    return 'var(--heat-critical)';
  };

  const tankSize = cycleData?.tankSol || cycleData?.potSizeSol || 0;
  const alphaClaw = cycleData?.alphaClaw || cycleData?.champion;
  const cycleNumber = cycleData?.cycleNumber || cycleData?.roundNumber || 1;
  const isCritical = heatLevel > 85;

  return (
    <main className={styles.main}>
      {/* Winner Popup */}
      {showWinner && (
        <div className={styles.winnerPopup} onClick={() => setShowWinner(false)}>
          <div className={styles.winnerContent}>
            <Image src="/winner-lobster.png" alt="Winner" width={120} height={120} className={styles.winnerIcon} />
            <h2 className={styles.winnerTitle}>MOLTDOWN!</h2>
            <div className={styles.winnerLabel}>Alpha Claw</div>
            <div className={styles.winnerCard}>
              <div className={styles.winnerRow}>
                <span className={styles.winnerRowLabel}>Winner</span>
                <span className={styles.winnerWallet}>
                  {alphaClaw?.wallet || lastCycle?.alphaWallet || lastCycle?.championWallet || '—'}
                </span>
              </div>
              <div className={styles.winnerRow}>
                <span className={styles.winnerRowLabel}>Extracted</span>
                <span className={styles.winnerAmount}>
                  {lastCycle ? `+${(lastCycle.alphaExtraction || lastCycle.championPayout || 0).toFixed(4)} SOL` : 
                   `+${(tankSize * 0.7).toFixed(4)} SOL`}
                </span>
              </div>
              <div className={styles.winnerLinks}>
                <a 
                  href={`https://solscan.io/account/${alphaClaw?.wallet || lastCycle?.alphaWallet || ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.winnerLink}
                  onClick={(e) => e.stopPropagation()}
                >
                  View on Solscan →
                </a>
              </div>
            </div>
            <div className={styles.winnerCycle}>Cycle #{cycleNumber}</div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <Image src="/lobster.png" alt="Logo" width={32} height={32} className={styles.logoImage} />
          <span className={`${styles.logoText} pixel-font`}>$MOLTDOWN</span>
        </div>
        <nav className={styles.nav}>
          <button onClick={() => setIsDocsOpen(true)} className={styles.navLink}>How It Works</button>
          <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className={styles.navLink}>X (Twitter)</a>
        </nav>
      </header>

      {/* Hero */}
      <section className={styles.hero}>
        <Image 
          src="/lobster-pot.png" 
          alt="Moltdown" 
          width={200} 
          height={200}
          className={styles.heroImage}
          priority
        />
        <h1 className={styles.title}>MOLTDOWN</h1>
        <p className={styles.subtitle}>Biggest claw wins. Rest get cooked.</p>
      </section>

      {/* Arena Card */}
      <section className={styles.arenaSection}>
        <div className={`${styles.arenaCard} ${isCritical ? styles.critical : ''}`}>
          {loading ? (
            <div className={styles.loading}>Heating up the tank...</div>
          ) : (
            <>
              {/* Temperature Gauge */}
              <div className={styles.temperatureSection}>
                <div className={styles.temperatureRow}>
                  {/* Thermometer Icon */}
                  <div className={`${styles.thermometerContainer} ${
                    heatLevel >= 85 ? styles.thermometerCritical : 
                    heatLevel >= 60 ? styles.thermometerShake : ''
                  }`}>
                    <Image 
                      src="/thermometer.png" 
                      alt="" 
                      width={40} 
                      height={40} 
                      className={styles.thermometerImage} 
                    />
                  </div>

                  {/* Temperature Bar */}
                  <div className={styles.gaugeWrapper}>
                    <div className={styles.temperatureGauge}>
                      <div 
                        className={styles.temperatureFill}
                        style={{ 
                          width: `${heatLevel}%`,
                          background: `linear-gradient(90deg, ${getHeatColor(heatLevel)} 0%, ${getHeatColor(Math.min(100, heatLevel + 20))} 100%)`
                        }}
                      />
                      <span className={styles.temperatureValue}>{Math.round(heatLevel)}%</span>
                    </div>
                    <div className={styles.temperatureInfo}>
                      {heatLevel >= 100 ? (
                        <span className={styles.temperatureStatus}>moltdown!</span>
                      ) : (
                        <span className={styles.temperatureText}>
                          {timeLeft}s until moltdown
                        </span>
                      )}
                      <span className={styles.temperatureText}>{cycleData?.participants || 0} in tank</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className={styles.statsGrid}>
                {/* Alpha Claw */}
                <div className={`${styles.statCard} ${styles.alphaSection}`}>
                  <div className={styles.alphaHeader}>
                    <Image src="/crown.png" alt="Alpha" width={28} height={28} className={styles.alphaIcon} />
                    <div className={styles.alphaLabel}>Alpha Claw</div>
                  </div>
                  {alphaClaw ? (
                    <>
                      <div className={styles.alphaWallet}>{formatWallet(alphaClaw.wallet)}</div>
                      <div className={styles.alphaPosition}>
                        {(alphaClaw as any).tokenBalanceFormatted || (alphaClaw as any).position || (alphaClaw as any).totalBought || 0} tokens
                      </div>
                    </>
                  ) : (
                    <div className={styles.noAlpha}>No alpha yet — be first!</div>
                  )}
                </div>

                {/* Tank */}
                <div className={`${styles.statCard} ${styles.tankSection}`}>
                  <div className={styles.tankHeader}>
                    <div className={styles.tankPotContainer}>
                      <Image src="/pot-red.png" alt="Tank" width={28} height={28} className={styles.tankIcon} />
                    </div>
                    <div className={styles.tankLabel}>The Tank</div>
                  </div>
                  <div className={styles.tankAmount}>{tankSize.toFixed(4)} SOL</div>
                  <div className={styles.tankSplit}>70% Alpha | 30% Buyback & Burn</div>
                </div>
              </div>

              {/* Pump.fun Source */}
              <div className={styles.sourceInfo}>
                <Image src="/pumpfun.png" alt="pump.fun" width={20} height={20} />
                <span>Powered by pump.fun • 0.5% creator fees fill the tank</span>
              </div>

              {/* Buy Button */}
              <a
                href="https://pump.fun"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.buyButton}
              >
                Buy $MOLTDOWN
              </a>
            </>
          )}
        </div>
      </section>

      {/* Last Cycle */}
      {lastCycle && (
        <div className={styles.lastCycleCard}>
          <div className={styles.lastCycleHeader}>
            <Image src="/fire.png" alt="" width={20} height={20} />
            <span className={styles.lastCycleLabel}>Last Moltdown</span>
          </div>
          <div className={styles.lastCycleStats}>
            <div className={styles.lastCycleStat}>
              <div className={styles.lastCycleStatLabel}>Alpha Extraction</div>
              <div className={styles.lastCycleStatValue}>
                {(lastCycle.alphaExtraction || lastCycle.championPayout || 0).toFixed(4)} SOL
              </div>
            </div>
            <div className={styles.lastCycleStat}>
              <div className={styles.lastCycleStatLabel}>Burned</div>
              <div className={styles.lastCycleStatValue}>
                {(lastCycle.shatterAmount || lastCycle.buybackAmount || 0).toFixed(4)} SOL
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <section className={styles.leaderboard}>
        <h2 className={styles.sectionTitle}>Current Positions</h2>
        <div className={styles.leaderboardCard}>
          {leaderboard.length === 0 ? (
            <div className={styles.leaderboardEmpty}>No positions yet</div>
          ) : (
            leaderboard.map((entry, i) => (
              <div 
                key={entry.wallet} 
                className={`${styles.leaderboardRow} ${i === 0 ? styles.isAlpha : ''}`}
              >
                <div className={styles.rank}>
                  {i === 0 ? (
                    <Image src="/crown.png" alt="Alpha" width={20} height={20} className={styles.rankIcon} />
                  ) : (
                    `#${i + 1}`
                  )}
                </div>
                <div className={styles.wallet}>{entry.walletShort}</div>
                <div className={styles.amount}>{entry.tokenBalanceFormatted || entry.totalBoughtSol?.toFixed(4) || '0'} tokens</div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* How It Works */}
      <section className={styles.howItWorks}>
        <h2 className={styles.sectionTitle}>How It Works</h2>
        <div className={styles.cardsGrid}>
          <div className={styles.card}>
            <Image src="/lobster.png" alt="" width={48} height={48} className={styles.cardIcon} />
            <h3 className={styles.cardTitle}>Take Position</h3>
            <p className={styles.cardText}>
              Buy $MOLTDOWN to take a position. Biggest position becomes Alpha Claw.
            </p>
          </div>

          <div className={styles.card}>
            <Image src="/fire.png" alt="" width={48} height={48} className={styles.cardIcon} />
            <h3 className={styles.cardTitle}>60 Second Cycles</h3>
            <p className={styles.cardText}>
              Tank heats up over 60 seconds. When it hits boiling, protocol executes.
            </p>
          </div>

          <div className={styles.card}>
            <Image src="/crown.png" alt="" width={48} height={48} className={styles.cardIcon} />
            <h3 className={styles.cardTitle}>70% Alpha Extraction</h3>
            <p className={styles.cardText}>
              Alpha Claw extracts 70% of the tank. Dominant position wins.
            </p>
          </div>

          <div className={styles.card}>
            <Image src="/pot-red.png" alt="" width={48} height={48} className={styles.cardIcon} />
            <h3 className={styles.cardTitle}>30% Shell Shatter</h3>
            <p className={styles.cardText}>
              30% buys back and burns $MOLTDOWN. Supply goes down.
            </p>
          </div>
        </div>
      </section>

      {/* Distribution Bars */}
      <section className={styles.distributionSection}>
        <h2 className={styles.sectionTitle}>Distribution</h2>
        <div className={styles.splitBars}>
          <div className={styles.splitItem}>
            <div className={styles.splitBarContainer}>
              <div className={`${styles.splitBar} ${styles.barAlpha}`} />
            </div>
            <div className={styles.splitBarInfo}>
              <span className={styles.splitBarPercent}>70%</span>
              <span className={styles.splitBarLabel}>Alpha Claw</span>
            </div>
          </div>
          <div className={styles.splitItem}>
            <div className={styles.splitBarContainer}>
              <div className={`${styles.splitBar} ${styles.barBurn}`} />
            </div>
            <div className={styles.splitBarInfo}>
              <span className={styles.splitBarPercent}>30%</span>
              <span className={styles.splitBarLabel}>Buyback & Burn</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.liveIndicator}>
          <span className={`${styles.liveDot} animate-live`}></span>
          Live • Cycle #{cycleNumber}
        </div>
        <div className={styles.footerText}>
          {cycleData?.participants || 0} in the tank • Molt or get cooked
        </div>
      </footer>

      <DocsModal isOpen={isDocsOpen} onClose={() => setIsDocsOpen(false)} />
    </main>
  );
}
