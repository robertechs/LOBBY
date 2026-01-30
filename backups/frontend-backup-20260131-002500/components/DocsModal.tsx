'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import styles from './DocsModal.module.css';

interface DocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DocsModal({ isOpen, onClose }: DocsModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose}>×</button>

        <div className={styles.header}>
          <Image src="/lobster-pot.png" alt="Moltdown" width={56} height={56} className={styles.headerImage} />
          <div>
            <h2 className={styles.title}>MOLTDOWN</h2>
            <p className={styles.subtitle}>Biggest claw wins. Rest get cooked.</p>
          </div>
        </div>

        {/* Diagram */}
        <div className={styles.diagram}>
          <div className={styles.flowRow}>
            <div className={styles.flowBox}>
              <Image src="/lobster.png" alt="" width={32} height={32} />
              <span>Buy $MOLTDOWN</span>
            </div>
            <div className={styles.arrow}>→</div>
            <div className={styles.flowBox}>
              <Image src="/fire.png" alt="" width={32} height={32} />
              <span>Tank Heats Up</span>
              <span className={styles.flowDesc}>from creator rewards</span>
            </div>
            <div className={styles.arrow}>→</div>
            <div className={styles.flowBox}>
              <Image src="/thermometer.png" alt="" width={32} height={32} />
              <span>60s Cycle</span>
            </div>
          </div>

          <div className={styles.centerArrow}>↓</div>

          <div className={styles.splitFlow}>
            <div className={styles.splitBox}>
              <Image src="/crown.png" alt="" width={40} height={40} />
              <div className={styles.splitPercent}>70%</div>
              <div className={styles.splitLabel}>Alpha Claw</div>
              <div className={styles.splitDesc}>Biggest position wins 70%</div>
            </div>
            <div className={styles.splitBox}>
              <Image src="/pot-red.png" alt="" width={40} height={40} />
              <div className={styles.splitPercent}>30%</div>
              <div className={styles.splitLabel}>Shell Shatter</div>
              <div className={styles.splitDesc}>Buyback and burn $MOLTDOWN</div>
            </div>
          </div>
        </div>

        {/* Pump.fun Source */}
        <div className={styles.sourceBox}>
          <Image src="/pumpfun.png" alt="pump.fun" width={32} height={32} className={styles.sourceIcon} />
          <div className={styles.sourceText}>
            <span className={styles.sourceLabel}>Powered by pump.fun</span>
            <span className={styles.sourceDesc}>Tank fills from 0.5% creator fees on every trade</span>
          </div>
        </div>

        {/* Info List */}
        <div className={styles.info}>
          <h3>How It Works</h3>
          <ul className={styles.infoList}>
            <li>Buy $MOLTDOWN on pump.fun to take a position</li>
            <li>Every trade generates 0.5% creator fees → fills the tank</li>
            <li>Biggest buyer becomes the Alpha Claw</li>
            <li>Every 60 seconds, the tank reaches boiling point</li>
            <li>Alpha Claw extracts 70% of the tank</li>
            <li>30% buys back and burns $MOLTDOWN</li>
          </ul>
        </div>

        <div className={styles.tagline}>Molt or get cooked.</div>
      </div>
    </div>
  );
}
