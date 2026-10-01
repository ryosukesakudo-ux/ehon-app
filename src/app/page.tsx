import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Arrow, BookIcon, Sparkle, Star } from "@/components/icons";
import { ANON_TRIAL_IMAGES, EXTRA_COPY_PRICE, SIZES, STORIES, TASTES, sceneText, yen } from "@/lib/catalog";
import { SAMPLE_CHILD_NAME, SAMPLE_SCENES, sampleUrl } from "@/lib/samples";
import { SampleImage } from "@/components/sample-image";
import s from "./top.module.css";

const NAVY = "#1E2F57";
const CREAM = "#FFF8EC";

function Wave({ from, to }: { from: string; to: string }) {
  return (
    <svg className={s.wave} style={{ background: from }} viewBox="0 0 390 40" preserveAspectRatio="none" aria-hidden="true">
      <path fill={to} d="M0 30 C 65 0, 130 0, 195 22 S 325 50, 390 18 L390 40 L0 40 Z" />
    </svg>
  );
}

function Cloud({ style }: { style: CSSProperties }) {
  return (
    <div className={s.cloud} style={style} aria-hidden="true">
      <span />
    </div>
  );
}

function Eyebrow({ children, color }: { children: ReactNode; color: string }) {
  return (
    <div className={`${s.eyebrow} display`} style={{ background: color }}>
      {children}
    </div>
  );
}

function Cta({ yellow = false }: { yellow?: boolean }) {
  return (
    <Link href="/create/taste" className={`cta${yellow ? " yellow" : ""}`} style={{ height: 62, fontSize: 19 }}>
      絵本をつくってみる
      <Arrow size={22} />
    </Link>
  );
}

const icon = (d: ReactNode, size = 26) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const STEPS = [
  { color: "#2F5DA8", shadow: "#D5DDEB", title: "タッチとお話をえらぶ", desc: "水彩・クレヨン・アニメ風から、お子さまに合うものを。" },
  { color: "#F08A6C", shadow: "#F2D3C8", title: "写真をアップロード", desc: "お子さまの写真1枚から。ママも一緒に登場できます。" },
  { color: "#7CC7A8", shadow: "#CFE7DC", title: "できあがりを見て注文", desc: "見本のページを確認してから。数日後に発送します。" },
];

const GIFTS = [
  { label: "お誕生日", d: <path d="M4 21h16M5 21v-8h14v8M12 13V9M12 6a1 1 0 0 0 0-3" /> },
  { label: "クリスマス", d: <path d="M12 3l6 9H6zM12 9l7 9H5zM12 18v3" /> },
  { label: "入園・入学", d: <path d="M3 9l9-4 9 4-9 4zM7 11v5c3 2 7 2 10 0v-5" /> },
  { label: "卒園の記念", d: <><circle cx="12" cy="9" r="5" /><path d="M9 13l-2 8 5-3 5 3-2-8" /></> },
  { label: "祖父母へのプレゼント", d: <path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7" /> },
];

const FAQ = [
  { q: "会員登録は必要ですか？", a: `登録なしでも1回だけ、見本${ANON_TRIAL_IMAGES}枚をお試しできます。作り直しやご注文は、無料会員登録（Google またはメールアドレス）のあとでご利用いただけます。`, color: "#F6C445" },
  { q: "写真はどう扱われますか？", a: "絵本の制作にだけ使います。マイページからいつでも削除でき、1年使わなければ自動で削除します。", color: "#2F5DA8" },
  { q: "届くまでどのくらいかかりますか？", a: "ご注文から数日後に発送します。", color: "#F08A6C" },
  { q: "気に入らない絵があったら？", a: "見本のページは、ご注文前に絵を作り直せます。", color: "#7CC7A8" },
];

export default function Home() {
  return (
    <div className={s.page}>
      <header className={s.header}>
        <Link href="/" className={`${s.logo} display`}>
          <span className={s.logoMark}><BookIcon /></span>
          わたしの絵本
        </Link>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/account" className={`${s.headerLink} display`}>マイページ</Link>
          <Link href="/create/taste" className={`${s.headerCta} display`}>つくる</Link>
        </div>
      </header>

      <section className={s.hero}>
        <Cloud style={{ left: -30, top: 30, width: 150 }} />
        <Cloud style={{ right: -40, top: 250, width: 170 }} />
        <Star size={18} className={s.deco} style={{ right: 22, top: 12, transform: "rotate(10deg)" }} />
        <Sparkle size={16} className={s.deco} style={{ left: 160, top: 8 }} />
        <div className={`${s.badge} display`}>1〜10歳の子どもへの贈りもの</div>
        <h1 className={`${s.h1} display`}>
          <span className="nowrap">わが子が主人公の</span>
          <br />
          <span className="nowrap">絵本、つくりませんか。</span>
        </h1>
        <p className={s.lead}>写真を1枚えらぶだけ。お子さまやママが登場する絵本を、AIがその子のためだけに描きます。</p>
        <div className={s.bookStage} aria-hidden="true">
          <div className={s.sun} />
          <Sparkle size={26} className={s.deco} style={{ left: 8, top: 30 }} />
          <Sparkle size={22} className={s.deco} style={{ left: 262, top: 210 }} />
          <Star size={30} color="#F08A6C" className={s.deco} style={{ left: 250, top: 14, transform: "rotate(12deg)" }} />
          <Star size={22} color="#7CC7A8" className={s.deco} style={{ left: 18, top: 232 }} />
          <div className={s.bookBack} />
          <div className={s.book}>
            <div className={s.bookArt}>
              <SampleImage src={sampleUrl("watercolor", "forest", 0)} alt="" fallback={<>[表紙の絵：お子さまが<br />森の入口で手をふる]</>} />
            </div>
            <div className={`${s.bookTitle} display`}>はるとと<br />もりのだいぼうけん</div>
          </div>
          <div className={`${s.sticker} display`}>
            <div style={{ fontSize: 12 }}>世界に</div>
            <div style={{ fontSize: 22 }}>1冊</div>
            <div style={{ fontSize: 12 }}>だけ</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Cta />
          <div className={s.note}>登録なしで1回お試しOK・お支払いは見本を確認してから</div>
        </div>
      </section>

      <Wave from="#BFE0F5" to={CREAM} />
      <div className={s.trust}>
        <div className={s.trustItem}>
          <div className={s.trustIcon} style={{ background: "#FFE6A6" }}>{icon(<><path d="M3 9l9-5 9 5v10H3z" /><path d="M9 19v-6h6v6" /></>)}</div>
          送料込み<br />ご自宅へお届け
        </div>
        <div className={s.trustItem}>
          <div className={s.trustIcon} style={{ background: "#FFD4C7" }}>{icon(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h5" /></>)}</div>
          しっかりした<br />ハードカバー
        </div>
        <div className={s.trustItem}>
          <div className={s.trustIcon} style={{ background: "#CDEEDD" }}>{icon(<><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>)}</div>
          写真はいつでも<br />削除できる
        </div>
      </div>

      <section className={s.section} style={{ background: CREAM, paddingTop: 16 }}>
        <Star size={22} className={s.deco} style={{ right: 24, top: 20, transform: "rotate(15deg)" }} />
        <Eyebrow color="#F08A6C">かんたん3ステップ</Eyebrow>
        <h2 className={`${s.h2} display`}>
          <span className="nowrap">スマホだけで、</span>
          <br />
          <span className="nowrap">かんたんに作れます。</span>
        </h2>
        <div className={s.steps}>
          {STEPS.map((st, i) => (
            <div key={st.title} className={s.stepCard} style={{ boxShadow: `0 4px 0 ${st.shadow}` }}>
              <div className={`${s.stepNum} display`} style={{ background: st.color }}>{i + 1}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div className={`${s.stepTitle} display`}>{st.title}</div>
                <div className={s.stepDesc}>{st.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Wave from={CREAM} to="#FFFFFF" />
      <section className={s.section} style={{ background: "#fff" }}>
        <Star size={20} color="#7CC7A8" className={s.deco} style={{ right: 20, top: 20 }} />
        <Eyebrow color="#7CC7A8">中身をのぞいてみる</Eyebrow>
        <h2 className={`${s.h2} display`}>
          <span className="nowrap">名前も、顔も、</span>
          <br />
          <span className="nowrap">その子だけの物語。</span>
        </h2>
        <div className={s.sample}>
          <div className={s.sampleBack} />
          <div className={s.sampleCard}>
            <div className={s.sampleArt}>
              <SampleImage src={sampleUrl("watercolor", "forest", 3)} alt="ママと手をつないで、ひかる木の実を見つける場面" fallback="[見開きの見本：ママと手をつないで歩く場面]" />
            </div>
            <p className={s.sampleText}>{sceneText(STORIES[0].scenes[3], SAMPLE_CHILD_NAME)}</p>
          </div>
          <div className={`${s.sampleTag} display`}>名前が入る！</div>
        </div>
        <div className={s.tastes}>
          {[
            { id: "watercolor", n: "水彩", bg: "#CFE3F0", bd: "#2F5DA8", c: "#43505C" },
            { id: "crayon", n: "クレヨン", bg: "#F8D9B8", bd: "#F08A6C", c: "#6A5440" },
            { id: "anime", n: "ふんわりアニメ", bg: "#DCEBD3", bd: "#7CC7A8", c: "#44543F" },
          ].map((t) => (
            <div key={t.n}>
              <div className={s.tasteSwatch} style={{ background: t.bg, borderColor: t.bd, color: t.c }}>
                <SampleImage src={sampleUrl(t.id as (typeof TASTES)[number]["id"], "forest", 0)} alt={`${t.n}の見本`} fallback="[見本]" />
              </div>
              <div className={`${s.tasteName} display`}>{t.n}</div>
            </div>
          ))}
        </div>
      </section>

      <Wave from="#FFFFFF" to="#E6F3FB" />
      <section className={s.section} style={{ background: "#E6F3FB" }}>
        <Star size={20} className={s.deco} style={{ right: 24, top: 22, transform: "rotate(-8deg)" }} />
        <Eyebrow color="#2F5DA8">3つのお話</Eyebrow>
        <h2 className={`${s.h2} display`}>
          <span className="nowrap">こんな絵本が</span>
          <br />
          <span className="nowrap">できあがります。</span>
        </h2>
        <div className={s.gallery}>
          {STORIES.map((st) => (
            <div key={st.id} className={s.galleryCard}>
              <div className={s.galleryMain}>
                <SampleImage src={sampleUrl("watercolor", st.id, SAMPLE_SCENES[0])} alt={`${st.name}の見本`} fallback={<span className={s.galleryFallback}>[見本の絵]</span>} />
              </div>
              <div className={s.galleryThumbs}>
                {SAMPLE_SCENES.slice(1).map((sc) => (
                  <div key={sc} className={s.galleryThumb}>
                    <SampleImage src={sampleUrl("watercolor", st.id, sc)} alt="" fallback={null} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <div className={`${s.galleryTitle} display`}>{st.name}</div>
                <div className="tag">{st.ages}</div>
              </div>
              <div className={s.galleryDesc}>{st.description}</div>
            </div>
          ))}
        </div>
        <div className={s.note}>見本の絵は、架空の家族で作っています</div>
      </section>

      <Wave from="#E6F3FB" to="#FFE9EE" />
      <section className={s.section} style={{ background: "#FFE9EE" }}>
        <Sparkle size={20} color="#F08A6C" className={s.deco} style={{ right: 26, top: 24 }} />
        <Eyebrow color="#F08A6C">こんな日の贈りものに</Eyebrow>
        <h2 className={`${s.h2} display`}>
          <span className="nowrap">何年たっても、</span>
          <br />
          <span className="nowrap">読み返したくなる1冊を。</span>
        </h2>
        <div className={s.chips}>
          {GIFTS.map((g) => (
            <div key={g.label} className={s.chip}>{icon(g.d, 18)}{g.label}</div>
          ))}
        </div>
      </section>

      <Wave from="#FFE9EE" to={CREAM} />
      <section className={s.section} style={{ background: CREAM }}>
        <Eyebrow color="#2F5DA8">料金</Eyebrow>
        <h2 className={`${s.h2} display`}>
          <span className="nowrap">送料込み、</span><span className="nowrap">追加料金なし。</span>
        </h2>
        <div className={s.prices}>
          {SIZES.map((p) => (
            <div key={p.id} className={`${s.price} ${p.popular ? s.priceHot : ""}`}>
              {p.popular && <div className={`${s.priceRibbon} display`}>いちばん人気</div>}
              <div className={`${s.priceSize} display`}>{p.name}</div>
              <div className={s.priceSpec}>{p.spec.replace("・ハードカバー", "")}</div>
              <div className={`${s.priceYen} display`}>{yen(p.price)}</div>
            </div>
          ))}
        </div>
        <div className={s.extra}>
          {icon(<path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7" />, 18)}
          <div>
            おじいちゃん・おばあちゃん用の2冊目は <span className="display" style={{ fontWeight: 900 }}>{yen(EXTRA_COPY_PRICE)}</span>（Mサイズ・同梱）
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--sub)" }}>すべてハードカバー・税込</div>
      </section>

      <section className={s.section} style={{ background: CREAM, paddingTop: 8, paddingBottom: 48 }}>
        <Eyebrow color="#7CC7A8">よくある質問</Eyebrow>
        <h2 className={`${s.h2} display`}>はじめての方へ</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {FAQ.map((f) => (
            <div key={f.q} className={s.qa}>
              <div className={s.qaQ}>
                <div className={`${s.qaMark} display`} style={{ background: f.color }}>Q</div>
                <div className={`${s.qaQText} display`}>{f.q}</div>
              </div>
              <div className={s.qaA}>{f.a}</div>
            </div>
          ))}
        </div>
      </section>

      <Wave from={CREAM} to={NAVY} />
      <section className={s.final}>
        <div className={s.moon} aria-hidden="true" />
        <div className={s.moonCut} aria-hidden="true" />
        <Star size={16} className={s.deco} style={{ left: 24, top: 30 }} />
        <Star size={10} color="#fff" className={s.deco} style={{ left: 80, top: 90 }} />
        <Sparkle size={14} className={s.deco} style={{ right: 40, top: 150 }} />
        <Sparkle size={12} color="#F4A9B8" className={s.deco} style={{ left: 30, top: 210 }} />
        <h2 className={`${s.finalH2} display`}>
          <span className="nowrap">その子の「いま」を、</span>
          <br />
          <span className="nowrap">絵本にのこそう。</span>
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8 }}>お支払いは、見本を確認してから。</p>
        <Cta yellow />
      </section>

      <footer className={s.footer}>
        <Link href="/legal">特定商取引法に基づく表記</Link>
        <Link href="/privacy">プライバシーポリシー</Link>
      </footer>
    </div>
  );
}
