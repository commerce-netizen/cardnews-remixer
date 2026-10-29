# 카드뉴스 각색기 (쿠팡파트너스용)

인스타그램 카드뉴스(캐러셀) 게시물 주소를 넣고 버튼 하나를 누르면,
슬라이드 글·캡션을 **원본과 다르게 각색**하고 깔끔한 디자인을 입혀 PNG로 내려받는 웹앱입니다.
50~60대도 혼자 쓸 수 있도록 큰 글씨·큰 버튼·한 화면 한 단계로 만들었습니다.

## 사용 흐름

1. **주소 넣기** → `카드뉴스 새로 만들기` 버튼
2. 자동으로 게시물 사진·캡션을 가져오고, AI가 사진 속 글씨를 읽어 각색
   - 자동 추출이 실패하면 **사진 직접 올리기 + 원문 붙여넣기** 화면으로 자동 안내
3. **미리보기**에서 디자인(4종) 고르기, 장마다 제목/설명 글 직접 수정, 사진 바꾸기, 캡션 수정
4. **승인하고 내려받기** → `slide_01.png …` (1080×1350) + `caption.txt` 를 zip으로 저장
   (휴대폰은 완성 사진을 눌러 한 장씩 저장 가능)

캡션 끝에는 쿠팡 파트너스 고지 문구가 자동으로 붙습니다.

## 구조

| 경로 | 역할 |
|---|---|
| `app/page.tsx` | 화면 흐름 (주소 입력 → 수동 업로드 → 로딩 → 편집) |
| `components/Editor.tsx` | 미리보기·수정·승인/다운로드 |
| `components/SlideCard.tsx` | 슬라이드 디자인 템플릿 4종 (1080×1350) |
| `app/api/extract` | 인스타 게시물 → 이미지 URL + 캡션 (GraphQL → 임베드 페이지 → og 태그 순으로 시도) |
| `app/api/image` | 인스타 CDN 이미지 프록시 (CORS 회피, 인스타 CDN 호스트만 허용) |
| `app/api/remix` | Claude가 슬라이드 이미지 속 글을 읽고 어미·톤·문장구조를 바꿔 각색 |
| `lib/export.ts` | 브라우저에서 PNG 렌더링(html-to-image) + zip(JSZip) |

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY 입력
npm run dev
```

## Vercel 배포

1. 이 저장소를 Vercel에 Import
2. Settings → Environment Variables 에 `ANTHROPIC_API_KEY` 추가
3. Deploy

| 환경변수 | 필수 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Claude API 키 |
| `LLM_MODEL` | | 기본 `claude-opus-5-5`. 비용을 줄이려면 `claude-sonnet-5-5` 등으로 변경 |
| `IG_DOC_ID` | | 인스타 GraphQL doc_id. 인스타 변경으로 자동 추출이 깨지면 교체 |

`/api/remix` 는 이미지 여러 장을 처리해 30초~1분 걸릴 수 있어 `maxDuration = 120` 으로 두었습니다
(요금제별 함수 최대 실행 시간을 확인하세요).

## 알려진 한계 / 다음 단계

- 인스타그램 자동 추출은 인스타 측 차단·구조 변경에 따라 실패할 수 있습니다 (특히 Vercel 서버 IP). 이때는 수동 경로를 쓰면 됩니다.
- 2단계: 슬라이드 이미지 AI 재생성 — 편집 화면의 `AI 새 사진 (준비 중)` 버튼 자리에 연결 예정.
