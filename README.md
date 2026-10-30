# 카드뉴스 각색기 (쿠팡파트너스용)

인스타그램 카드뉴스(캐러셀) 게시물 주소를 넣고 버튼 하나를 누르면,
슬라이드 글·캡션을 **원본과 다르게 각색**하고 깔끔한 디자인을 입혀 PNG로 내려받는 웹앱입니다.
50~60대도 혼자 쓸 수 있도록 큰 글씨·큰 버튼·한 화면 한 단계로 만들었습니다.

## 사용 흐름

1. **주소 넣기** → `카드뉴스 새로 만들기` 버튼
2. 자동으로 게시물 사진·캡션을 가져오고, AI가 사진 속 글씨를 읽어 각색
   - 자동 추출이 실패하면 **사진 직접 올리기 + 원문 붙여넣기** 화면으로 자동 안내
3. **미리보기**에서 1번 장·2번 장… 카드마다 사진 바꾸기, 글 직접 수정(1번=표지 제목, 2번부터=본문), 워터마크 문구·캡션 수정
4. **승인하고 내려받기** → `slide_01.png …` (1080×1350) + `caption.txt` 를 zip으로 저장
   (휴대폰은 완성 사진을 눌러 한 장씩 저장 가능)

캡션 끝에는 쿠팡 파트너스 고지 문구가 자동으로 붙습니다.

## 슬라이드 디자인

저장소 루트의 레퍼런스 4장(`ref-slide1-cover.jpg` ~ `ref-slide4-cta.jpg`)을 픽셀 측정해 그대로 옮겼습니다 (`components/SlideCard.tsx`).

- 공통: 1080×1350, 배경에 그 장의 사진을 꽉 차게, 오른쪽 위 `[광고]`(쿠팡 파트너스 고지), 아래 가운데 워터마크(기본 `맛집도둑`, 편집 화면에서 수정·브라우저에 기억)
- 1번 장(표지): 큰 흰 제목, 검은 외곽선·그림자, 박스 없음, 아래쪽 왼쪽 정렬
- 2번 장부터: 아래 가운데 반투명 박스(레퍼런스 측정값: 흰색 48% + 얇은 검은 테두리) 안에 흰 글씨 가운데 정렬
- 글꼴: 제목·본문 [Jua](https://fonts.google.com/specimen/Jua)(둥근 굵은 고딕, SIL OFL), `[광고]`·워터마크 Pretendard
- 글이 길면 글자 크기를 자동으로 줄입니다

## AI (OpenAI)

| 용도 | 모델 (기본값) | 호출 위치 |
|---|---|---|
| 사진 속 글씨 읽기(vision) + 각색 | `gpt-5-mini` — Responses API, 구조화 출력(JSON 스키마) | `lib/remix.ts` |
| AI 새 사진 만들기 (2단계, 기본 꺼짐) | `gpt-image-1-mini` — Images API | `lib/image-gen.ts` |

> ⚠️ OpenAI 공지 기준 **`gpt-image-1-mini`는 2026-12-01, `gpt-5-mini`는 2026-12-11 지원 종료 예정**입니다.
> 종료 후에는 해당 기능이 "AI 모델을 찾을 수 없어요" 오류를 냅니다. 그 전에 환경변수
> `OPENAI_TEXT_MODEL` / `OPENAI_IMAGE_MODEL` 만 바꾸면 코드 수정 없이 교체됩니다
> (OpenAI 권장 후속: 글 → `gpt-5.6-terra`. 이미지 → 공식 지원 종료 문서의 권장 모델 확인).

### 비용 (월 $3, 하루 1건·4장 기준)

저비용 설정: 각색은 `reasoning.effort: low`, 출력 상한 8,000토큰, 재시도 1회. AI 사진은 `low` 품질, 버튼을 누를 때만 1장씩 생성.

| 항목 | 1건(4장) 대략 | 한 달(30건) 대략 |
|---|---|---|
| 각색 (gpt-5-mini, 입력 $0.25 / 출력 $2 per 1M) | 약 $0.005~0.02 | 약 $0.15~0.6 |
| AI 사진 4장 (gpt-image-1-mini low 1024×1536, 장당 $0.006) | 약 $0.024 | 약 $0.72 |

사진 입력 토큰 수는 해상도에 따라 달라지므로 위 수치는 추정치입니다. **실제 한도는 OpenAI 대시보드에서 거세요**:
platform.openai.com → Settings → Limits(프로젝트 Budget)에서 월 $3로 설정. 한도를 다 쓰면 앱은
"이번 달 사용 한도를 다 쓴 거예요" 안내를 보여주고, 수동 편집·다운로드는 그대로 쓸 수 있습니다.

## 구조

| 경로 | 역할 |
|---|---|
| `app/page.tsx` | 화면 흐름 (주소 입력 → 수동 업로드 → 로딩 → 편집) |
| `components/Editor.tsx` | 미리보기·수정·AI 사진·승인/다운로드 |
| `components/SlideCard.tsx` | 슬라이드 디자인 템플릿 4종 (1080×1350) |
| `app/api/extract` | 인스타 게시물 → 이미지 URL + 캡션 (GraphQL → 임베드 페이지 → og 태그 순으로 시도) |
| `app/api/image` | 인스타 CDN 이미지 프록시 (CORS 회피, 인스타 CDN 호스트만 허용) |
| `app/api/remix` | gpt-5-mini가 슬라이드 사진 속 글을 읽고 어미·톤·문장구조를 바꿔 각색 |
| `app/api/image-gen` | gpt-image-1-mini로 슬라이드 배경 사진 생성 (2단계) |
| `lib/openai.ts` | OpenAI 클라이언트, 모델 ID, 오류 메시지 |
| `lib/export.ts` | 브라우저에서 PNG 렌더링(html-to-image) + zip(JSZip) |

## 로컬 실행

```bash
npm install
cp .env.local.example .env.local   # OPENAI_API_KEY 입력
npm run dev
```

키 없이 화면만 보려면 `.env.local`에 `MOCK_LLM=1`을 넣고 실행하세요 (예시 문장·예시 사진).

## 테스트

```bash
npm run build
npm run test:ai    # 가짜 OpenAI 서버로 각색·AI 사진의 요청 형식과 오류 처리(거절·잘림·429·401·404) 확인
npm run test:e2e   # 데모 모드로 화면 전체 흐름(업로드→각색→수정→zip 다운로드) 확인, Playwright 필요
```

## Vercel 배포

1. 이 저장소를 Vercel에 Import
2. Settings → Environment Variables 에 `OPENAI_API_KEY` 추가
3. Deploy

| 환경변수 | 필수 | 설명 |
|---|---|---|
| `OPENAI_API_KEY` | ✅ | OpenAI API 키 |
| `OPENAI_TEXT_MODEL` | | 기본 `gpt-5-mini` |
| `OPENAI_IMAGE_MODEL` | | 기본 `gpt-image-1-mini` |
| `OPENAI_IMAGE_QUALITY` | | `low`(기본) / `medium` / `high` |
| `NEXT_PUBLIC_ENABLE_IMAGE_GEN` | | `1`이면 'AI 새 사진 만들기' 버튼 켬. 바꾸면 **재배포** 필요 |
| `IG_DOC_ID` | | 인스타 GraphQL doc_id. 인스타 변경으로 자동 추출이 깨지면 교체 |
| `MOCK_LLM` | | `1`이면 데모 모드. **실서비스에선 비워 두기** |

`/api/remix`, `/api/image-gen` 은 30초~1분 걸릴 수 있어 `maxDuration = 120` 으로 두었습니다
(요금제별 함수 최대 실행 시간을 확인하세요).

## 알려진 한계

- 인스타그램 자동 추출은 인스타 측 차단·구조 변경에 따라 실패할 수 있습니다 (특히 Vercel 서버 IP). 이때는 수동 경로를 쓰면 됩니다.
- AI 사진은 글씨 없는 배경 사진만 만듭니다. 글씨는 앱의 디자인 템플릿이 위에 얹습니다.
