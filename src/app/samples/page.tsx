import type { Metadata } from "next";
import Link from "next/link";
import { Arrow } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { SampleImage } from "@/components/sample-image";
import { SITE_NAME } from "@/components/brand";
import { samplePublicUrl } from "@/lib/samples";
import { SERIES_PAGES, seriesFamilyPhotoPath, seriesImagePath, seriesSampleChildName, seriesSheetPath } from "@/lib/series";
import { SERIES_DATA } from "@/lib/series-data";
import { OPEN_SERIES, getSeriesInfo, openEpisodes } from "@/lib/story-key";
import { SampleEpisodes, type SampleEpisode } from "./episodes";
import s from "./samples.module.css";

export const metadata: Metadata = { title: `サンプル集 | ${SITE_NAME}` };

// サンプル集：公開中のシリーズ（いまは森）の各話を、表紙と最初の5場面まで読める。6場面目からは「届いてからのお楽しみ」。
// 見本は架空の家族（森は はると・ママ・パパ。シリーズによって違う家族）。どの人の写真からどの登場人物になったかを、家族写真と設定画で見せる。

/** 中身まで読める場面の数（表紙は別） */
const OPEN_SCENES = 5;
/** 文の量「普通」 */
const LEVEL_INDEX = 1;

const SERIES = OPEN_SERIES[0];
/** 見本の主人公の名前（シリーズによって家族が違う） */
const SAMPLE_CHILD_NAME = seriesSampleChildName(SERIES);

function plainText(text: string) {
  // 多いの ふりがな（漢字《かな》）は外す。普通には無いが念のため
  return text.replaceAll("{name}", SAMPLE_CHILD_NAME).replace(/《[^》]*》/g, "");
}

export default function SamplesPage() {
  const data = SERIES_DATA[SERIES];
  const info = getSeriesInfo(SERIES)!;
  const episodes: SampleEpisode[] = openEpisodes(data.episodes).map((ep) => ({
    no: ep.no,
    title: ep.title,
    season: info.episodes.find((e) => e.no === ep.no)?.season ?? "",
    lead: `${SAMPLE_CHILD_NAME}の ${data.name} 第${ep.no}話`,
    cover: samplePublicUrl(seriesImagePath(SERIES, ep.no, 0)),
    pages: ep.scenes.slice(0, OPEN_SCENES).map((sc, i) => {
      // 見本の家族はママもパパもいるので、両方の写真がある形の文を使う（絵も同じ形で描いている）
      const v = sc.alt?.both ?? sc;
      return { url: samplePublicUrl(seriesImagePath(SERIES, ep.no, i + 1)), text: plainText(v.text[LEVEL_INDEX] ?? v.text[0]) };
    }),
    locked: Array.from({ length: SERIES_PAGES - 1 - OPEN_SCENES }, (_, i) => samplePublicUrl(seriesImagePath(SERIES, ep.no, OPEN_SCENES + 1 + i))),
  }));

  return (
    <div className={s.page}>
      <PageHeader title="サンプル集" />

      <section className={s.section}>
        <p className={s.lead}>
          実際にできあがる絵本の見本です。シリーズ「{data.name}」の第1〜{episodes.length}話を、表紙と最初の{OPEN_SCENES}ページまで読めます。
        </p>
      </section>

      <section className={s.section}>
        <div className={`${s.eyebrow} display`}>写真から登場人物へ</div>
        <h2 className={`${s.h2} display`}>
          <span className="nowrap">この家族写真から、</span>
          <br />
          <span className="nowrap">この登場人物に。</span>
        </h2>
        <figure className={s.figure}>
          <div className={s.photo}>
            <SampleImage
              src={samplePublicUrl(seriesFamilyPhotoPath(SERIES))}
              alt={`見本の家族写真（左からママ・${SAMPLE_CHILD_NAME}・パパ）`}
              sizes="(max-width: 480px) 100vw, 440px"
              // 森の写真はトップと共用の正方形。横長の枠では上下が切れるので、顔のある上寄りを残す
              style={{ objectPosition: "50% 35%" }}
              fallback={<span className={s.fallback}>家族写真（準備中）</span>}
            />
            {/* 写真は左からママ・主人公・パパの順に並ぶように作っている（絵スタジオ） */}
            <div className={s.tags} aria-hidden="true">
              <span className={s.tag} style={{ background: "var(--pink)" }}>ママ</span>
              <span className={s.tag} style={{ background: "var(--coral)" }}>{SAMPLE_CHILD_NAME}（主人公）</span>
              <span className={s.tag} style={{ background: "var(--blue)" }}>パパ</span>
            </div>
          </div>
          <figcaption>アップロードした家族写真。家族写真の中から、主人公・ママ・パパの顔をそれぞれ選びます</figcaption>
        </figure>
        <div className={s.down} aria-hidden="true">
          <Arrow size={22} />
        </div>
        <figure className={s.figure}>
          <div className={s.sheet}>
            <SampleImage
              src={samplePublicUrl(seriesSheetPath(SERIES))}
              alt={`絵本の登場人物（${SAMPLE_CHILD_NAME}・ママ・パパと、${data.sidekickLabel}）`}
              sizes="(max-width: 480px) 100vw, 440px"
              style={{ objectFit: "contain" }}
              fallback={<span className={s.fallback}>登場人物（準備中）</span>}
            />
          </div>
          <figcaption>
            絵本の登場人物。{SAMPLE_CHILD_NAME}・ママ・パパの顔や髪型が、写真をもとに描かれます（{data.sidekickLabel}はお話の相棒です）
          </figcaption>
        </figure>
        <ul className={s.points}>
          <li>写真はお子さま1人だけでもOK。ママだけ・パパだけでも、その人が登場するお話になります</li>
          <li>家族がそれぞれ写った写真を別々にアップしても大丈夫です</li>
        </ul>
        <div className={s.note}>見本は、AIで作った架空の家族です</div>
      </section>

      <section className={s.section}>
        <div className={`${s.eyebrow} display`} style={{ background: "var(--mint)" }}>
          {data.name}
        </div>
        <h2 className={`${s.h2} display`}>
          <span className="nowrap">見本の絵本を</span>
          <br />
          <span className="nowrap">読んでみよう。</span>
        </h2>
        <p className={s.lead}>{info.description}。お話を選んでください。</p>
        <SampleEpisodes episodes={episodes} />
      </section>

      <section className={s.section} style={{ paddingBottom: 48 }}>
        <Link href="/create/taste" className="cta" style={{ height: 62, fontSize: 19 }}>
          わが子の絵本をつくる
          <Arrow size={22} />
        </Link>
        <Link href="/" className={s.back}>トップへもどる</Link>
      </section>
    </div>
  );
}
