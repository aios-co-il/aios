import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveAppHomePath } from "@/lib/appHomePath";
import "./carmen-landing.css";

const modules = [
  {
    n: "01",
    title: "CRM ולידים",
    desc: "אני מכירה את הלקוחות שלך. כל ליד, שיחה וסטטוס במקום אחד.",
    icon: "◎",
  },
  {
    n: "02",
    title: "WhatsApp ואוטומציות",
    desc: "ליד חדש? אני עוזרת להניע את התקשורת והמשך הטיפול.",
    icon: "↗",
  },
  {
    n: "03",
    title: "דוחות ודשבורדים",
    desc: "אני מחברת את הנתונים לתמונה שאפשר להבין ולפעול לפיה.",
    icon: "▥",
  },
  {
    n: "04",
    title: "משימות וצוות",
    desc: "כל משימה קשורה לתוכנית. כל תוכנית קשורה למטרה.",
    icon: "✓",
  },
  {
    n: "05",
    title: "כספים",
    desc: "הכנסות, הוצאות ותמונת העסק — בלי לעבור בין מערכות.",
    icon: "₪",
  },
  {
    n: "06",
    title: "חתימה דיגיטלית",
    desc: "מסמכים ואישורים שנשארים בתוך תהליך העבודה.",
    icon: "✎",
  },
  {
    n: "07",
    title: "דיוור",
    desc: "תקשורת שיווקית שמתחברת למסע הלקוח.",
    icon: "✉",
  },
  {
    n: "08",
    title: "קריאייטיב וקופי",
    desc: "רעיונות, מסרים ותוצרים שמתחברים לתוכנית השיווק.",
    icon: "✦",
  },
];
const controlModes = [
  {
    n: "01",
    label: "בשליטה שלך",
    short: "כרמן מרכזת וממליצה",
    title: "אתה מנהל. כרמן מחברת את התמונה.",
    description:
      "כרמן מרכזת נתונים, מזהה מה דורש תשומת לב, בונה המלצות ומשימות — ואתה והצוות מחליטים ומבצעים.",
    bullets: [
      "תובנות והמלצות",
      "ריכוז נתונים",
      "בניית משימות",
      "שליטה מלאה באישורים",
    ],
  },
  {
    n: "02",
    label: "עובדים יחד",
    short: "כרמן מכינה. אתה מאשר",
    title: "כרמן מכינה את העבודה. אתה מאשר.",
    description:
      "מבריף ועד תוצרים: כרמן מכינה תוכן, מהלכים, משימות ו־follow-ups. אתה מאשר את הנקודות החשובות וממשיכים.",
    bullets: ["קבלת בריף", "יצירת תוכן", "בניית מהלכים", "אישור לפני ביצוע"],
  },
  {
    n: "03",
    label: "ביצוע מונחה",
    short: "כרמן מריצה. אתה מפקח",
    title: "יותר ביצוע. פחות לרדוף אחרי משימות.",
    description:
      "כרמן מפעילה תהליכים מוגדרים, מטפלת בלידים, מפעילה תקשורת שוטפת ומנהלת משימות — עם בקרה שלך בנקודות רגישות.",
    bullets: [
      "לידים ו־CRM",
      "WhatsApp ודיוור",
      "משימות צוות",
      "בקרה דרך הדשבורד",
    ],
  },
  {
    n: "04",
    label: "כרמן מנהלת",
    short: "מערכת שיווק שעובדת בשבילך",
    title: "כרמן מנהלת את כל המערכת השיווקית.",
    description:
      "קמפיינים, SEO, GEO, תוכן, סושיאל, דיוור, לידים, מכירות, אוטומציות ודוחות — מחוברים לתוכנית אחת, עם אנשי מקצוע כשצריך.",
    bullets: [
      "קמפיינים וקריאייטיב",
      "SEO / GEO / סושיאל",
      "לידים ומכירות",
      "מדידה, דוחות ואופטימיזציה",
    ],
  },
];

const WHATSAPP_URL =
  "https://wa.me/972507677613?text=" +
  encodeURIComponent("שלום, הגעתי מאתר Carmen Marketing OS ואשמח לשמוע פרטים.");
export default function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    const redirectSignedIn = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user || cancelled) return;
      const homePath = await resolveAppHomePath(session.user.id);
      if (homePath && !cancelled) navigate(homePath, { replace: true });
    };
    void redirectSignedIn();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void resolveAppHomePath(session.user.id).then((homePath) => {
          if (homePath && !cancelled) navigate(homePath, { replace: true });
        });
      }
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate]);
  const [active, setActive] = useState(0),
    [menu, setMenu] = useState(false),
    [controlMode, setControlMode] = useState(0);

  const updateControlDial = (
    element: HTMLElement,
    clientX: number,
    clientY: number,
  ) => {
    const rect = element.getBoundingClientRect();
    const x = clientX - (rect.left + rect.width / 2);
    const y = clientY - (rect.top + rect.height / 2);
    const angle = (Math.atan2(y, x) * 180) / Math.PI;
    const normalized = (angle + 450) % 360;
    setControlMode(Math.round(normalized / 90) % 4);
  };
  useEffect(() => {
    const nodes = document.querySelectorAll(".carmen-site .reveal");
    const ob = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("shown");
            ob.unobserve(e.target);
          }
        }),
      { threshold: 0.12 },
    );
    nodes.forEach((n) => ob.observe(n));
    return () => ob.disconnect();
  }, []);
  return (
    <main className="carmen-site">
      <header className="nav">
        <a className="brand" href="#" aria-label="Carmen Marketing OS">
          <img
            className="carmen-brand-wordmark-image"
            src="/brand/carmen/wordmark-soft.webp"
            alt="Carmen Marketing OS"
          />
        </a>
        <nav className={menu ? "open" : ""}>
          <a onClick={() => setMenu(false)} href="#why">
            הגישה
          </a>
          <a onClick={() => setMenu(false)} href="#system">
            המערכת
          </a>
          <a onClick={() => setMenu(false)} href="#workflow">
            איך אני עובדת
          </a>
          <a
            onClick={() => setMenu(false)}
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            בואו נדבר
          </a>
          <Link onClick={() => setMenu(false)} to="/auth">
            התחברות
          </Link>
        </nav>
        <div className="carmen-account-actions">
          <Link className="nav-cta" to="/auth">
            התחברות
          </Link>

          <a
            className="nav-cta carmen-whatsapp-nav"
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            בואו נדבר <span>↗</span>
          </a>
        </div>
        <button
          className="menu-button"
          onClick={() => setMenu(!menu)}
          aria-label="פתיחת תפריט"
        >
          {menu ? "✕" : "☰"}
        </button>
      </header>
      <section className="hero">
        <div className="carmen-magnetic-ribbon ribbon-one" />
        <div className="carmen-magnetic-ribbon ribbon-two" />
        <div className="hero-glow" />
        <div className="hero-grid" />
        <div className="hero-content">
          <span className="eyebrow">
            <span className="live-dot" /> CARMEN MARKETING OS
          </span>
          <h1>
            מנהלת השיווק
            <br />
            <span className="gradient-text">החדשה שלך.</span>
          </h1>
          <p>
            העסק שלך לא צריך עוד קמפיין. הוא צריך מישהי שתחבר את כל השיווק,
            המכירות והניהול — למקום אחד.
          </p>
          <div className="hero-actions">
            <a
              className="button primary"
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              בוא נדבר על העסק שלך <span>↗</span>
            </a>
            <a className="button secondary" href="#system">
              תראה מה אני עושה ↓
            </a>
          </div>
        </div>
        <div className="hero-art" aria-label="Carmen Marketing OS">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <img
            className="hero-carmen-symbol"
            src="/brand/carmen/symbol-soft.webp"
            alt="סמל Carmen Marketing OS"
          />
          <img
            className="hero-carmen-character"
            src="/brand/carmen/carmen-character-hq.webp"
            alt="כרמן, מנהלת השיווק החדשה שלך"
            width={900}
            height={1350}
            fetchPriority="high"
            decoding="async"
          />
          <div
            className="carmen-hero-metrics"
            aria-label="יכולות Carmen Marketing OS"
          >
            <span>
              BRIEF <b>מקבלת בריף</b>
            </span>
            <span>
              CONTENT <b>יוצרת תוכן</b>
            </span>
          </div>
          <div className="glass-panel panel-a">
            <small>MARKETING OS</small>
            <strong>כל השיווק במקום אחד.</strong>
            <p>
              קליטת לידים, ניהול מכירות
              <br />
              אוטומציות WhatsApp ודיוור
            </p>
          </div>
          <div className="glass-panel panel-b">
            <small>GROWTH</small>
            <strong>קידום אורגני ו־GEO</strong>
            <p>דוחות ומדידות</p>
            <div className="bars">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="glass-panel panel-c">
            <span className="signal">✦</span>
            <strong>כרמן מנהלת הכל!</strong>
          </div>
        </div>
        <div className="scroll-cue">
          SCROLL TO EXPLORE <span>↓</span>
        </div>
      </section>
      <section id="why" className="manifesto light-section">
        <div className="section-inner reveal">
          <span className="kicker">01 / THE SHIFT</span>
          <h2>
            קמפיינר חדש
            <br />
            <em>לא יפתור את הבעיה.</em>
          </h2>
          <p>
            אתם צריכים מנהל שיווק שינהל לכם את כל המערכת. קמפיינים, SEO, GEO,
            דיוור, סושיאל וגרילה — כרמן מרכזת, מחברת ועוזרת לכם לבצע את הכול.
          </p>
          <div className="connection">
            <span>אסטרטגיה</span>
            <b>↔</b>
            <span>קמפיינים</span>
            <b>↔</b>
            <span>SEO / GEO</span>
            <b>↔</b>
            <span>דיוור / סושיאל</span>
            <b>↔</b>
            <span>מכירות</span>
          </div>
        </div>
      </section>
      <section id="system" className="modules-section">
        <div className="section-inner">
          <div className="section-heading reveal">
            <span className="kicker">02 / ONE OPERATING SYSTEM</span>
            <h2>
              אני לא עוד מערכת.
              <br />
              <span>אני מחברת את כולן.</span>
            </h2>
            <p>
              כל מה שהעסק צריך כדי לנהל שיווק ומכירות. לא אוסף כלים שלא מדברים
              אחד עם השני.
            </p>
          </div>
          <div className="module-layout">
            <div className="module-list">
              {modules.map((m, i) => (
                <button
                  key={m.n}
                  className={"module-row " + (i === active ? "active" : "")}
                  onClick={() => setActive(i)}
                >
                  <span className="module-number">{m.n}</span>
                  <span>{m.title}</span>
                  <span className="module-arrow">↗</span>
                </button>
              ))}
            </div>
            <div className="module-stage">
              <div className="stage-glow" />
              <div className="module-stage-inner" key={active}>
                <div className="module-icon">{modules[active].icon}</div>
                <span className="stage-label">
                  CARMEN / MODULE {modules[active].n}
                </span>
                <h3>{modules[active].title}</h3>
                <p>{modules[active].desc}</p>
                <div className="module-line">
                  <span>CONNECTED TO CARMEN OS</span>
                  <span className="green">●</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="workflow" className="journey">
        <div className="section-inner">
          <div className="reveal">
            <span className="kicker">03 / FROM LEAD TO ACTION</span>
            <h2>
              ליד נכנס.
              <br />
              <span>אני כבר על זה.</span>
            </h2>
            <p>פחות לעבור בין מערכות. יותר לדעת מה קורה בכל שלב.</p>
          </div>
          <div className="journey-track">
            {[
              { n: "01", t: "ליד נכנס", d: "כל פנייה מקבלת מקום" },
              { n: "02", t: "WhatsApp", d: "תקשורת אוטומטית" },
              { n: "03", t: "CRM", d: "תיעוד ומעקב" },
              { n: "04", t: "משימה", d: "המשך טיפול בצוות" },
            ].map((s) => (
              <div className="journey-step reveal" key={s.n}>
                <span>{s.n}</span>
                <div className="journey-dot" />
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="data-section">
        <div className="section-inner data-grid">
          <div className="reveal">
            <span className="kicker">04 / SEE THE WHOLE PICTURE</span>
            <h2>
              הנתונים לא צריכים לחכות
              <br />
              <span>לסוף החודש.</span>
            </h2>
            <p>
              דוחות ודשבורדים שמחברים את המספרים לתמונה ברורה. בלי לחפש בין עשר
              מערכות.
            </p>
          </div>
          <div
            className="dashboard"
            aria-label="המחשת דשבורד, ללא נתונים אמיתיים"
          >
            <div className="dash-top">
              <span>OVERVIEW / ILLUSTRATION</span>
              <span className="green">● CARMEN OS</span>
            </div>
            <div className="dash-cards">
              <div>
                <small>CAMPAIGNS</small>
                <strong>CONNECTED</strong>
              </div>
              <div>
                <small>LEADS</small>
                <strong>IN SYNC</strong>
              </div>
            </div>
            <div className="chart-bars">
              {[32, 45, 39, 65, 53, 76, 68, 90, 82].map((h, i) => (
                <i key={i} style={{ height: h + "%" }} />
              ))}
            </div>
            <small className="dash-foot">
              Illustrative visualization — not live business data
            </small>
          </div>
        </div>
      </section>
      <section className="control-section light-section">
        <div className="section-inner reveal">
          <span className="kicker">05 / YOU STAY IN CONTROL</span>
          <h2>
            אני עובדת בדרך שלך.
            <br />
            <em>אתה מחליט כמה אני עושה לבד.</em>
          </h2>
          <p>
            מייעוץ חכם ועד ניהול שיווק כמעט מלא — אתה קובע את רמת העצמאות, וכרמן
            מתאימה את עצמה לדרך שבה העסק שלך רוצה לעבוד.
          </p>

          <div className="control-console">
            <div className="control-dial-wrap">
              <div className="control-dial-scene">
                <div
                  className="control-dial"
                  role="slider"
                  tabIndex={0}
                  aria-label="רמת העבודה של כרמן"
                  aria-valuemin={1}
                  aria-valuemax={4}
                  aria-valuenow={controlMode + 1}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                      e.preventDefault();
                      setControlMode((controlMode + 1) % controlModes.length);
                    }
                    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                      e.preventDefault();
                      setControlMode(
                        (controlMode - 1 + controlModes.length) %
                          controlModes.length,
                      );
                    }
                  }}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    updateControlDial(e.currentTarget, e.clientX, e.clientY);
                  }}
                  onPointerMove={(e) => {
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      updateControlDial(e.currentTarget, e.clientX, e.clientY);
                    }
                  }}
                >
                  <div className="control-dial-rings" aria-hidden="true" />
                  <div
                    className="control-dial-knob"
                    style={{
                      transform: `rotate(${controlMode * 90}deg)`,
                    }}
                    aria-hidden="true"
                  >
                    <span />
                  </div>
                  <div className="control-dial-center">
                    <small>MODE</small>
                    <strong>{controlModes[controlMode].n}</strong>
                    <span>{controlModes[controlMode].label}</span>
                  </div>

                  {controlModes.map((mode, index) => (
                    <button
                      key={mode.n}
                      type="button"
                      className={`control-dial-stop stop-${index} ${
                        controlMode === index ? "active" : ""
                      }`}
                      aria-pressed={controlMode === index}
                      aria-label={`בחרו במצב ${mode.n}: ${mode.label}`}
                      title={`לחצו להפעלת מצב: ${mode.label}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setControlMode(index);
                      }}
                    >
                      <span>{mode.n}</span>
                      <b>{mode.label}</b>
                      <span className="control-stop-tap" aria-hidden="true">
                        ↗
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <p className="control-drag-hint">
                ↔ גררו את הגלגל או לחצו על אחד מארבעת המצבים
              </p>
            </div>

            <div
              className="control-mode-card"
              data-mode={controlMode + 1}
              aria-live="polite"
              key={controlMode}
            >
              <span className="control-mode-kicker">
                CARMEN / MODE {controlModes[controlMode].n}
              </span>
              <h3>{controlModes[controlMode].title}</h3>
              <p>{controlModes[controlMode].description}</p>
              <div className="control-mode-list">
                {controlModes[controlMode].bullets.map((item) => (
                  <span key={item}>
                    <i>✓</i>
                    {item}
                  </span>
                ))}
              </div>
              <div className="control-mode-status">
                <span>רמת מעורבות כרמן</span>
                <b>{controlModes[controlMode].short}</b>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="audience">
        <div className="section-inner reveal">
          <span className="kicker">06 / BUILT TO SCALE</span>
          <h2>
            לעסק אחד.
            <br />
            או למאה לקוחות.
          </h2>
          <div className="audience-cards">
            <div>
              <span>↗</span>
              <h3>לעסקים</h3>
              <p>מקום אחד לנהל בו את השיווק, המכירות והפעילות.</p>
            </div>
            <div>
              <span>↗</span>
              <h3>לסוכנויות</h3>
              <p>תמונה אחידה של לקוחות, משימות, דוחות ותהליכים.</p>
            </div>
            <div>
              <span>↗</span>
              <h3>עם צוות מומחים</h3>
              <p>כרמן לצד אנשי מקצוע שמובילים את הפעילות השיווקית.</p>
            </div>
          </div>
        </div>
      </section>
      <section id="contact" className="closing">
        <div className="closing-glow" />
        <div className="section-inner reveal">
          <span className="kicker">READY FOR WHAT'S NEXT?</span>
          <h2>
            בוא נדבר על
            <br />
            <span>העסק שלך.</span>
          </h2>
          <p>
            אני כרמן. בוא נראה איך אפשר לחבר את כל השיווק והמכירות שלך למקום
            אחד.
          </p>
          <a
            className="button primary"
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            בואו נכיר <span>↗</span>
          </a>
        </div>
      </section>
      <footer className="footer">
        <a className="brand" href="#">
          <img
            className="carmen-brand-wordmark-image"
            src="/brand/carmen/wordmark-soft.webp"
            alt="Carmen Marketing OS"
          />
        </a>
        <span>© {new Date().getFullYear()} Carmen Marketing OS</span>
        <nav className="footer-legal" aria-label="מידע משפטי">
          <Link to="/privacy">מדיניות פרטיות</Link>
          <span aria-hidden="true">·</span>
          <Link to="/terms">תנאי שימוש</Link>
          <span aria-hidden="true">·</span>
          <Link to="/data-deletion">מחיקת מידע</Link>
        </nav>
        <a href="#">חזרה למעלה ↑</a>
      </footer>
    </main>
  );
}
