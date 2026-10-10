import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Arrow, Sparkle, Star } from "@/components/icons";
import { ANON_TRIAL_IMAGES, EXTRA_COPY_PRICE, MEMBER_MONTHLY_PREVIEWS, SIZES, STORIES, TASTES, sceneText, yen } from "@/lib/catalog";
import { SAMPLE_CHILD_NAME, SAMPLE_SCENES, SHOWCASE, SHOWCASE_BOOK, SHOWCASE_PHOTO, samplePublicUrl, sampleUrl } from "@/lib/samples";
import { SampleImage } from "@/components/sample-image";
import { Brand } from "@/components/brand";
import { Lottie } from "@/components/lottie";
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
  { color: "#F08A6C", shadow: "#F2D3C8", title: "写真をアップロード", desc: "お子さまの写真1枚から。ママやパパも一緒に登場できます。" },
  { color: "#7CC7A8", shadow: "#CFE7DC", title: "できあがりを見て注文", desc: "見本のページを確認してから。数日後に発送します。" },
];

// 贈りものの場面。カラフルな小さいイラストで華やかに
const GIFTS: { label: string; bg: string; art: ReactNode }[] = [
  {
    label: "お誕生日",
    bg: "#FFE0E6",
    art: (
      <>
        <rect x="4" y="13" width="16" height="8" rx="2" fill="#F07FA0" />
        <path d="M4 16c2 1.5 4 1.5 5.3 0 1.4 1.5 4 1.5 5.4 0 1.3 1.5 3.3 1.5 5.3 0v-1c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2z" fill="#fff" />
        <rect x="11" y="8" width="2" height="5" rx="1" fill="#7CC7A8" />
        <path d="M12 3c1.6 1.8 1.6 3.4 0 4.2-1.6-.8-1.6-2.4 0-4.2z" fill="#F6A93B" />
      </>
    ),
  },
  {
    label: "クリスマス",
    bg: "#DDF3E8",
    art: (
      <>
        <path d="M12 4l5 7h-2.5l4 6H5.5l4-6H7z" fill="#5CBF8F" />
        <rect x="10.8" y="17" width="2.4" height="4" rx="1" fill="#B5835A" />
        <path d="M12 1.5l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" fill="#F6C445" />
        <circle cx="10" cy="11" r="1" fill="#F08A6C" />
        <circle cx="14" cy="14.5" r="1" fill="#F6C445" />
        <circle cx="9" cy="15.5" r="1" fill="#3E8EE0" />
      </>
    ),
  },
  {
    label: "入園・入学",
    bg: "#FFF1CC",
    art: (
      <>
        <rect x="5" y="7" width="14" height="14" rx="4" fill="#E9575B" />
        <path d="M5 11c0-2.2 1.8-4 4-4h6c2.2 0 4 1.8 4 4v1H5z" fill="#C93F45" />
        <rect x="10.5" y="13" width="3" height="3" rx="1" fill="#F6C445" />
        <path d="M9 7V5.5C9 4.1 10.3 3 12 3s3 1.1 3 2.5V7" stroke="#C93F45" strokeWidth="1.6" fill="none" />
      </>
    ),
  },
  {
    label: "卒園の記念",
    bg: "#DCEBFB",
    art: (
      <>
        <path d="M8 13l-2 8 6-3 6 3-2-8z" fill="#3E8EE0" />
        <circle cx="12" cy="9" r="6" fill="#F6C445" />
        <circle cx="12" cy="9" r="4" fill="#FCD96B" />
        <path d="M12 6.3l.8 1.6 1.7.2-1.3 1.2.3 1.7-1.5-.8-1.5.8.3-1.7-1.3-1.2 1.7-.2z" fill="#E59E1B" />
      </>
    ),
  },
  {
    label: "祖父母へのプレゼント",
    bg: "#FDE3D9",
    art: (
      <>
        <rect x="4" y="11" width="16" height="10" rx="2" fill="#F08A6C" />
        <rect x="3" y="8" width="18" height="4" rx="1.5" fill="#F4A48C" />
        <rect x="10.8" y="8" width="2.4" height="13" fill="#F6C445" />
        <path d="M12 8c-2-3.5-5.5-3-4.5-1S11 8 12 8zm0 0c2-3.5 5.5-3 4.5-1S13 8 12 8z" fill="#F6C445" />
      </>
    ),
  },
];

const FAQ = [
  { q: "会員登録は必要ですか？", a: `登録なしでも1回だけ、見本${ANON_TRIAL_IMAGES}枚をお試しできます。作り直しやご注文は、無料会員登録（Google またはメールアドレス）のあとでご利用いただけます。`, color: "#F6C445" },
  { q: "写真はどう扱われますか？", a: "絵本の制作にだけ使います。マイページからいつでも削除でき、1年使わなければ自動で削除します。", color: "#2F5DA8" },
  { q: "届くまでどのくらいかかりますか？", a: "ご注文から数日後に発送します。", color: "#F08A6C" },
  { q: "気に入らない絵があったら？", a: "見本のページは、ご注文前に絵を作り直せます。", color: "#7CC7A8" },
];

// 見出しの1文字ずつの色と傾き（はずむカラフル文字、2026-10-10 作道さん選択）
const BOUNCE_COLORS = ["#F08A6C", "#F6A93B", "#5CBF8F", "#3E8EE0", "#F07FA0"];
const BOUNCE_TILT = [-6, 4, -3, 5, -4, 3];

function BouncyLine({ text, offset, big = [] }: { text: string; offset: number; big?: number[] }) {
  return (
    <span className="nowrap" aria-hidden="true">
      {[...text].map((c, n) => {
        const i = offset + n;
        return (
          <span
            key={n}
            className={s.bounce}
            style={{ color: BOUNCE_COLORS[i % BOUNCE_COLORS.length], transform: `rotate(${BOUNCE_TILT[i % BOUNCE_TILT.length]}deg) translateY(${i % 2 ? -2 : 2}px)`, fontSize: big.includes(n) ? "1.2em" : undefined }}
          >
            {c}
          </span>
        );
      })}
    </span>
  );
}

/** 見出しの中の強調語（色付き・少し大きめ。傾けない） */
function Pop({ children, color }: { children: string; color: string }) {
  return (
    <span className={s.pop} style={{ color }}>
      {children}
    </span>
  );
}

export default function Home() {
  return (
    <div className={s.page}>
      <header className={s.header}>
        <Link href="/" className={s.logo}>
          <Brand size={36} />
        </Link>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/login?next=/account" className={`${s.headerLink} display`}>ログイン</Link>
          <Link href="/create/taste" className={`${s.headerCta} display`}>つくる</Link>
        </div>
      </header>

      <section className={s.hero}>
        <Cloud style={{ left: -30, top: 30, width: 150 }} />
        <Cloud style={{ right: -40, top: 250, width: 170 }} />
        <Star size={18} className={s.deco} style={{ right: 22, top: 12, transform: "rotate(10deg)" }} />
        <Sparkle size={16} className={s.deco} style={{ left: 160, top: 8 }} />
        <div className={`${s.badge} display`}>1〜10歳の子どもへの贈りもの</div>
        <h1 className={`${s.h1} display`} aria-label="わが子が主人公の絵本、つくりませんか">
          <BouncyLine text="わが子が主人公の" big={[4, 5, 6]} offset={0} />
          <br />
          <BouncyLine text="絵本、つくりませんか" offset={8} />
        </h1>
        <p className={s.lead}>
          <span className={`${s.leadKey} display`}>写真を1枚えらぶだけ。</span>
          <span className={s.leadBody}>
            お子さまはもちろん、<span className="nowrap">ママやパパも絵本の中へ。</span>
            <br />
            <span className="nowrap">世界に1冊だけの物語を、</span>
            <span className="nowrap">製本してお届けします。</span>
          </span>
        </p>
        <div className={s.bookStage} aria-hidden="true">
          {/* 完成した絵本の表紙（作道さんが用意した画像、2026-10-10 差し替え）。影も画像に含まれているので加工はしない */}
          <div className={s.sun} />
          <Image src="/hero-book-yui-v2.webp" alt="" width={800} height={793} priority sizes="250px" className={s.heroBook} />
          <Lottie name="sparkles" style={{ position: "absolute", inset: 0 }} />
          <Sparkle size={26} className={s.deco} style={{ left: 8, top: 30 }} />
          <Sparkle size={22} className={s.deco} style={{ left: 262, top: 210 }} />
          <Star size={30} color="#F08A6C" className={s.deco} style={{ left: 250, top: 14, transform: "rotate(12deg)" }} />
          <Star size={22} color="#7CC7A8" className={s.deco} style={{ left: 18, top: 232 }} />
          <div className={`${s.sticker} display`}>
            <div style={{ fontSize: 12 }}>世界に</div>
            <div style={{ fontSize: 22 }}>1冊</div>
            <div style={{ fontSize: 12 }}>だけ</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Cta />
          <Link href="/login?next=/create/taste" className="ghost" style={{ height: 52, fontSize: 16, borderColor: "var(--navy)", color: "var(--navy)" }}>
            無料会員登録・ログインしてつくる
          </Link>
          <div className={s.note}>登録なしでも1回お試しOK・お支払いは見本を確認してから</div>
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
          しっかりした<br />製本
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
          <span className="nowrap"><Pop color="#F08A6C">かんたん</Pop>に作れます。</span>
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

      <section className={s.section} style={{ background: CREAM, paddingTop: 8 }}>
        <Eyebrow color="#7CC7A8">写真から絵本へ</Eyebrow>
        <h2 className={`${s.h2} display`}>
          <span className="nowrap">この写真から、</span>
          <br />
          <span className="nowrap">こんな<Pop color="#5CBF8F">1ページ</Pop>に。</span>
        </h2>
        <div className={s.showcase}>
          <figure className={s.showcaseItem}>
            <div className={s.showcasePhoto}>
              <SampleImage src={samplePublicUrl(SHOWCASE_PHOTO)} alt="家族3人の写真（見本）" fallback={<span className={s.galleryFallback}>[家族の写真]</span>} />
            </div>
            <figcaption>アップする写真</figcaption>
          </figure>
          <div className={s.showcaseArrow} aria-hidden="true"><Arrow size={22} /></div>
          <figure className={s.showcaseItem}>
            <div className={s.showcaseBook}>
              <SampleImage src={samplePublicUrl(SHOWCASE_BOOK)} alt="写真をもとに描いた絵本の1ページ（見本）" fallback={<span className={s.galleryFallback}>[絵本の1ページ]</span>} />
            </div>
            <figcaption>できあがる絵</figcaption>
          </figure>
        </div>
        <p className={s.sampleText} style={{ padding: 0 }}>{sceneText(STORIES.find((st) => st.id === SHOWCASE.story)!.scenes[SHOWCASE.scene], SAMPLE_CHILD_NAME)}</p>
        <div className={s.note}>見本は、AIで作った架空の家族です</div>
      </section>

      <section className={s.section} style={{ background: CREAM, paddingTop: 8 }}>
        <div className={s.member}>
          <Sparkle size={18} color="#F6C445" className={s.deco} style={{ right: 18, top: 16 }} />
          <div className={`${s.memberTitle} display`}>無料会員になると</div>
          <ul className={s.memberList}>
            <li>見本の絵を月{MEMBER_MONTHLY_PREVIEWS}枚まで作れる（作り直しもOK）</li>
            <li>写真を保存して、次の絵本にも使える</li>
            <li>作った絵本をマイページで見返せる</li>
          </ul>
          <Link href="/login?next=/create/taste" className="cta yellow" style={{ height: 54, fontSize: 17 }}>
            無料で会員登録してつくる
            <Arrow />
          </Link>
          <div style={{ fontSize: 12, textAlign: "center" }}>Google アカウントかメールアドレスで、すぐに登録できます。登録後はそのまま絵本づくりに進みます</div>
        </div>
      </section>

      <Wave from={CREAM} to="#FFFFFF" />
      <section className={s.section} style={{ background: "#fff" }}>
        <Star size={20} color="#7CC7A8" className={s.deco} style={{ right: 20, top: 20 }} />
        <Eyebrow color="#7CC7A8">中身をのぞいてみる</Eyebrow>
        <h2 className={`${s.h2} display`}>
          <span className="nowrap">名前も、顔も、</span>
          <br />
          <span className="nowrap"><Pop color="#F07FA0">その子だけ</Pop>の物語。</span>
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
            { id: "watercolor", bg: "#CFE3F0", bd: "#2F5DA8", c: "#43505C" },
            { id: "crayon", bg: "#F8D9B8", bd: "#F08A6C", c: "#6A5440" },
            { id: "anime", bg: "#DCEBD3", bd: "#7CC7A8", c: "#44543F" },
          ].map((v) => {
            const t = TASTES.find((x) => x.id === v.id)!;
            return (
              <div key={t.id}>
                <div className={s.tasteSwatch} style={{ background: v.bg, borderColor: v.bd, color: v.c }}>
                  <SampleImage src={sampleUrl(t.id, "forest", 0)} alt={`${t.name}の見本`} fallback="[見本]" sizes="(max-width: 640px) 33vw, 200px" />
                </div>
                <div className={`${s.tasteName} display`}>{t.name}</div>
                <div className={s.tastePoints}>{t.points.slice(0, 2).join("・")}</div>
              </div>
            );
          })}
        </div>
      </section>

      <Wave from="#FFFFFF" to="#E6F3FB" />
      <section className={s.section} style={{ background: "#E6F3FB" }}>
        <Star size={20} className={s.deco} style={{ right: 24, top: 22, transform: "rotate(-8deg)" }} />
        <Eyebrow color="#2F5DA8">3つのお話</Eyebrow>
        <h2 className={`${s.h2} display`}>
          <span className="nowrap">こんな絵本が</span>
          <br />
          <span className="nowrap"><Pop color="#F6A93B">できあがり</Pop>ます。</span>
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
                    <SampleImage src={sampleUrl("watercolor", st.id, sc)} alt="" fallback={null} sizes="(max-width: 640px) 50vw, 240px" />
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
          <span className="nowrap">読み返したくなる<Pop color="#F08A6C">1冊</Pop>を。</span>
        </h2>
        <div className={s.chips}>
          {GIFTS.map((g) => (
            <div key={g.label} className={`${s.chip} display`}>
              <span className={s.chipArt} style={{ background: g.bg }}>
                <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">{g.art}</svg>
              </span>
              {g.label}
            </div>
          ))}
        </div>
      </section>

      <Wave from="#FFE9EE" to={CREAM} />
      <section className={s.section} style={{ background: CREAM }}>
        <Eyebrow color="#2F5DA8">料金</Eyebrow>
        <h2 className={`${s.h2} display`}>
          <span className="nowrap"><Pop color="#5CBF8F">送料込み</Pop>、</span><span className="nowrap">追加料金なし。</span>
        </h2>
        <div className={s.prices}>
          {SIZES.map((p) => (
            <div key={p.id} className={`${s.price} ${p.popular ? s.priceHot : ""}`}>
              {p.popular && <div className={`${s.priceRibbon} display`}>いちばん人気</div>}
              <div className={`${s.priceSize} display`}>{p.name}</div>
              <div className={s.priceSpec}>{p.spec}</div>
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
        <div style={{ fontSize: 12, color: "var(--sub)" }}>税込</div>
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
          <span className="nowrap"><Pop color="#F6C445">絵本</Pop>にのこそう。</span>
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8 }}>お支払いは、見本を確認してから。</p>
        <Cta yellow />
      </section>

      <footer className={s.footer}>
        <Link href="/legal">特定商取引法に基づく表記</Link>
        <Link href="/privacy">プライバシーポリシー</Link>
        <Link href="/terms">利用規約</Link>
      </footer>
    </div>
  );
}
