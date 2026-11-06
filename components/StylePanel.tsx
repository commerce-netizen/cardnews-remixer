"use client";

import { useState } from "react";
import FontPicker from "./FontPicker";
import { BOX_COLORS, ColorField, Range, Seg, Toggle } from "./controls";
import { WEIGHT_LABEL, fontWeights, snapWeight } from "@/lib/webfonts";
import type { Align, BlockStyle, VAlign } from "@/lib/layout";

const ALIGN_LABEL: Record<Align, string> = { left: "왼쪽", center: "가운데", right: "오른쪽" };
const VALIGN_LABEL: Record<VAlign, string> = { top: "위", middle: "가운데", bottom: "아래" };

type Props = {
  style: BlockStyle;
  onChange: (patch: Partial<BlockStyle>) => void;
  /** 미리보기 글 (글꼴 고르기 칸에 보여 줌) */
  sample?: string;
};

/** 글 상자 하나의 모양을 전부 조절하는 칸: 글꼴·굵기·크기·색·정렬·간격·위치·글상자·테두리·그림자·강조색 */
export default function StylePanel({ style: st, onChange, sample }: Props) {
  const [more, setMore] = useState(false);
  const weights = fontWeights(st.fontId);

  return (
    <div className="stack style-panel">
      <div>
        <span className="field-label">글꼴</span>
        <FontPicker value={st.fontId} onChange={(fontId) => onChange({ fontId, weight: snapWeight(fontId, st.weight) })} sample={sample} />
      </div>

      {weights.length > 1 && (
        <div>
          <span className="field-label">굵기</span>
          <div className="seg seg-wrap">
            {weights.map((w) => (
              <button key={w} type="button" className={snapWeight(st.fontId, st.weight) === w ? "on" : ""} onClick={() => onChange({ weight: w })}>
                {WEIGHT_LABEL[w] ?? w}
              </button>
            ))}
          </div>
        </div>
      )}

      <Range label="글자 크기" value={st.size} min={12} max={240} unit="px" onChange={(size) => onChange({ size })} />
      <ColorField label="글자색" value={st.color} onChange={(color) => onChange({ color })} />

      <Seg<Align> label="가로 정렬" value={st.align} options={["left", "center", "right"]} labels={ALIGN_LABEL} onChange={(align) => onChange({ align })} />
      <Seg<VAlign> label="세로 정렬 (상자 안)" value={st.vAlign} options={["top", "middle", "bottom"]} labels={VALIGN_LABEL} onChange={(vAlign) => onChange({ vAlign })} />

      <div className="duo-tight">
        <Range label="줄 간격" value={st.lineHeight} min={0.8} max={2.4} step={0.05} unit="배" onChange={(lineHeight) => onChange({ lineHeight })} />
        <Range label="자간" value={st.letterSpacing} min={-15} max={30} unit="%" onChange={(letterSpacing) => onChange({ letterSpacing })} />
      </div>

      <Toggle label="글자 테두리" hint="사진 위에서도 또렷하게" checked={st.outline} onChange={(outline) => onChange({ outline })} />
      {st.outline && (
        <div className="sub stack">
          <ColorField label="테두리 색" value={st.outlineColor} presets={["#000000", "#ffffff", "#1c1c1e", "#ffe14d", "#c62828"]} onChange={(outlineColor) => onChange({ outlineColor })} />
          <Range label="테두리 두께" value={st.outlineWidth} min={1} max={14} unit="px" onChange={(outlineWidth) => onChange({ outlineWidth })} />
        </div>
      )}
      <Toggle label="글자 그림자" checked={st.shadow} onChange={(shadow) => onChange({ shadow })} />
      {st.shadow && (
        <div className="sub">
          <ColorField label="그림자 색" value={st.shadowColor} presets={["#000000", "#ffffff", "#1c1c1e"]} onChange={(shadowColor) => onChange({ shadowColor })} />
        </div>
      )}

      <Toggle label="글상자" hint="글 뒤에 바탕을 깔아요" checked={st.box} onChange={(box) => onChange({ box })} />
      {st.box && (
        <div className="sub stack">
          <ColorField label="글상자 색" value={st.boxColor} presets={BOX_COLORS} onChange={(boxColor) => onChange({ boxColor })} />
          <Range label="글상자 진하기" value={st.boxOpacity} min={0} max={100} unit="%" onChange={(boxOpacity) => onChange({ boxOpacity })} />
          <div className="duo-tight">
            <Range label="모서리 둥글기" value={st.boxRadius} min={0} max={120} unit="px" onChange={(boxRadius) => onChange({ boxRadius })} />
            <Range label="안쪽 여백" value={st.boxPad} min={0} max={120} unit="px" onChange={(boxPad) => onChange({ boxPad })} />
          </div>
          <Toggle label="글상자 테두리" checked={st.boxBorder} onChange={(boxBorder) => onChange({ boxBorder })} />
          {st.boxBorder && (
            <ColorField label="테두리 색" value={st.boxBorderColor} presets={["#000000", "#ffffff", "#ffe14d"]} onChange={(boxBorderColor) => onChange({ boxBorderColor })} />
          )}
        </div>
      )}

      <ColorField label="강조 줄 색 (X = 강조 안 함)" allowNone value={st.accentColor} presets={["#ffe14d", "#ff5a3c", "#2f6bff", "#1b7f3a", "#ffffff", "#1c1c1e"]} onChange={(accentColor) => onChange({ accentColor })} />

      <button type="button" className="link-btn" style={{ alignSelf: "flex-start" }} onClick={() => setMore((v) => !v)}>
        {more ? "▲ 위치 숫자 닫기" : "▼ 위치·크기 숫자로 맞추기"}
      </button>
      {more && (
        <div className="duo-tight">
          <Range label="왼쪽에서" value={st.x} min={-20} max={100} step={0.5} unit="%" onChange={(x) => onChange({ x })} />
          <Range label="위에서" value={st.y} min={-20} max={100} step={0.5} unit="%" onChange={(y) => onChange({ y })} />
          <Range label="상자 폭" value={st.w} min={5} max={120} step={0.5} unit="%" onChange={(w) => onChange({ w })} />
          <Range label="상자 높이" value={st.h} min={3} max={120} step={0.5} unit="%" onChange={(h) => onChange({ h })} />
        </div>
      )}
      <p className="muted small" style={{ margin: 0 }}>
        미리보기에서 글을 <b>끌면 옮겨지고</b>, 오른쪽 아래 <b>손잡이를 끌면 상자 크기</b>가 바뀌어요. 글이 상자보다 길면 글자가 알아서 작아져요.
      </p>
    </div>
  );
}
