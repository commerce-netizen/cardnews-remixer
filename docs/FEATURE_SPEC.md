# 돈작가 사진 생성기 — 기능명세서

> 기준: `main` 브랜치 7637542 (PR #42까지 반영) · 작성일 2026-11-23
> 라이브: https://cardnews-remixer.vercel.app · 저장소: `commerce-netizen/cardnews-remixer`
> 이 문서는 **현재 코드 기준 동작**을 정리한 것입니다. README 일부(초기 MVP 설명)는 이후 변경이 반영되지 않았으니 충돌하면 이 문서를 우선하세요.

---

## 1. 제품 개요

| 항목 | 내용 |
|---|---|
| 한 줄 정의 | 인스타그램 카드뉴스(캐러셀) 주소 하나를 넣으면 **새 사진 + 새 글**로 다시 만든 카드뉴스와 캡션·고정 댓글·자동 DM 문구를 한 번에 만들어 주는 웹앱 |
| 주 사용처 | 쿠팡파트너스 인스타 계정 운영 (레시피·생활용품·제품 소개 카드뉴스) |
| 사용자 | 돈작가 강의 수강생 등 초대받은 회원 (시크릿 코드 필요) |
| UX 원칙 | 50~60대도 혼자 쓸 수 있게 **큰 글씨·큰 버튼·한 화면 한 단계**. 한글 UI. 내부 동작(사진 몇 장 생성 중 등)은 화면에 노출하지 않음 |
| 요금 | 서비스 이용료 없음. AI 비용은 **각 회원 본인 OpenAI 키**로 부담 (관리자는 운영자 키) |

### 기술 스택
- Next.js 16 (App Router, `proxy.ts` = 미들웨어) · React 19 · TypeScript
- Supabase (`@supabase/ssr`) — 인증(구글·카카오·이메일) + Postgres
- OpenAI (`openai` SDK) — 글 각색(텍스트·비전), 이미지 편집·생성
- `sharp`(서버 이미지 색 보정), `html-to-image` + `jszip`(브라우저에서 PNG 렌더·압축)
- 배포: Vercel (Hobby 팀 `mincompany1`), `main` 머지 시 자동 배포

---

## 2. 화면 구성 (정보 구조)

상단 고정 머리줄: 로고(돈작가 사진 생성기) · 탭 3개 · 로그인/마이페이지 · 밝게/어둡게 토글

| 경로 | 화면 | 접근 |
|---|---|---|
| `/` | **사진 콘텐츠 만들기** (메인 기능) | 회원 |
| `/hot` | **인기 게시물** (레퍼런스 계정 카드뉴스 순위) | 회원 |
| `/templates` | **디자인 템플릿** (기본 제공 / 내 템플릿 / 만들기) | 회원 |
| `/login` | 로그인·회원가입 | 누구나 |
| `/mypage` | 계정, 시크릿 코드 입력, OpenAI 키 연결, 로그아웃 | 로그인 |
| `/admin` | 관리자 모드 | `ADMIN_EMAILS` + 구글 로그인 |
| `/privacy`, `/terms` | 개인정보처리방침·이용약관 | 누구나 |

반응형: PC(≥980px)는 가로로 펼쳐 한눈에, 모바일은 세로로 쌓고 미리보기가 위에 붙어 따라다님. 다크모드(시스템 기본 + 수동 토글, `localStorage.theme`).

---

## 3. 기능 상세

### 3.1 사진 콘텐츠 만들기 (`/`)

**상태 흐름:** `home` → `loading` → `edit` (추출 실패 시 `manual` → `loading` → `edit`)

#### ① 주소 입력 (home)
- 인스타 게시물 URL 입력칸 1개 + 큰 버튼 1개 ("주소만 넣으면 새 사진·새 글로 다시 만들어 드려요.")
- `/?url=…` 로 들어오면 자동 시작 (인기 게시물 탭의 '각색하기'가 사용)
- "직접 올리기" 링크 → manual

#### ② 게시물 가져오기 — `POST /api/extract`
- 입력: `{ url }` → 출력: `{ imageUrls: string[], caption: string }`
- 시도 순서: GraphQL(`IG_DOC_ID`) → 임베드 페이지 `node:https` 직접 요청 → **r.jina.ai 렌더링 프록시** → og 태그
  - 핵심: `fetch`(undici)는 `Sec-Fetch-Mode`를 `cors`로 덮어써 인스타가 빈 껍데기를 줌 → 브라우저 헤더 세트를 그대로 보내는 `node:https`(`rawGet`) 사용
  - 퍼가기 막힌 게시물도 슬라이드 전체 수집 (PR #17)
- 이미지는 `GET /api/image?url=` 프록시로 표시 (인스타 CDN 호스트만 허용, CORS 회피)
- 실패 시 **manual**: 사진 직접 업로드 + 원문 붙여넣기 (브라우저에서 축소한 data URL 전송)

#### ③ 생성 (loading) — 글과 사진 **병렬**
- **글 각색** `POST /api/remix` (요청: `imageUrls | imageDataUrls, caption, slideText`)
  - 응답 `RemixResult`: `slides[{original,title,body}]`, `caption`, `recipe`(레시피 여부), `commerce`(광고 게시물 여부), `dm`(레시피일 때만)
  - 모델이 사진 속 글을 읽고(vision) 각색. 상세 규칙은 §4
- **AI 새 사진** `POST /api/image-gen` — 모든 장을 동시에 (브라우저 동시 3개 제한)
- **템플릿 칸 채우기** `POST /api/fill` — 선택한 템플릿 양식의 칸(제목·리스트·표 등)에 장 내용을 나눠 넣음 (동시 4개 제한)
- 동시 요청 제어 `lib/ai-fetch.ts`: `pool()`로 묶음, **429(분당 한도)** 는 20초·45초 후 자동 재시도, **402(잔액·월 한도)** 는 즉시 안내 (문구 구분)
- 일부 장 사진 실패 → 그 장은 **빈 바탕**으로 진행 (원본 사진은 글자가 박혀 있어 겹치므로 쓰지 않음)
- 로딩 문구는 진행감만 주고 내부 동작은 숨김

#### ④ 결과 화면 (edit) — PR #35에서 단순화
남긴 기능만:
1. **템플릿 고르기** (기본 제공·내 템플릿). 바꾸면 AI 재호출 없이(필요 시 fill만) 다시 그림
2. **[광고] 표시** 토글 (commerce 게시물 기본 켜짐)
3. **완성본 미리보기** (1080×1350, PC 가로 나란히 / 모바일 가로 스냅)
4. **장마다 글 고치기**, 사진 바꾸기(업로드), `✨ AI 새 사진` 다시 만들기
5. **올릴 글 확인하기**: 캡션 / 고정 댓글 / 자동 DM (각각 편집 가능)
6. **승인하고 내려받기**

> 디자인 수정(글꼴·색·글상자 이동 등)은 결과 화면에 없음 — **디자인 템플릿 탭에서만** 한다 (의도된 결정).

#### ⑤ 내려받기 (`lib/export.ts`)
| 기기 | 동작 |
|---|---|
| PC | zip: `slide_01.png …`(1080×1350) + `caption.txt` + `pinned_comment.txt` + `dm.txt` |
| 아이폰 | "사진 N장 사진 앱에 저장하기" → 공유 시트 '이미지 N개 저장' |
| 안드로이드 | 한 장씩 자동 저장 → 갤러리 Download 앨범 |
- PNG 렌더 시 사용한 웹폰트만 임베드 (CORS 허용 CDN)

---

### 3.2 인기 게시물 (`/hot`)
- 레퍼런스 인스타 계정들의 카드뉴스를 **좋아요순 / 댓글순** × **일일 / 주간 / 월간 / 역대** 로 정렬
  - 기간 탭은 게시물을 **거르지 않음**. 항상 전체 게시물을 보여 주고, 그 기간에 **늘어난** 좋아요·댓글 순으로 줄 세움. 역대 = 누적. 기록이 부족하면 하루 평균으로 추정
  - 기본 탭 = 일일
- 카드 호버/탭 → `게시물 보기`(인스타) / `각색하기`(`/?url=` 자동 시작)
- 영상 슬라이드 포함·릴스·사진 1장 게시물은 제외 (사진 없는 게시물 절대 노출 금지)
- **데이터 경로**
  - 수집 대상 계정: `scripts/hot/accounts.json` (아이디만 추가·삭제, main 파일을 수집기가 매번 raw로 읽음)
  - 매일 06시 운영자 맥에서 `scripts/hot/aside-collect.mjs` (Aside 브라우저로 프로필 그리드 hover → 좋아요·댓글, 새 게시물은 `/p/` 페이지에서 날짜·캡션) — launchd `scripts/hot/aside-install.sh`
  - 결과는 **`hot-data` 브랜치(orphan, 매번 force-push)** 에 `hot.json` + `thumbs/*.webp`. 수집 실패 시 기존 데이터 보존 (PR #37)
  - 앱은 `GET /api/hot` 이 raw.githubusercontent를 프록시 (10분 캐시), 썸네일 `GET /api/hot/thumb/[code]` → **재배포 불필요**
  - 예비 수집: GitHub Actions `hot-posts.yml` (브라이트데이터, 수동 실행 전용, 크레딧 소모)
  - 의존성: **운영자 맥이 06시에 켜져 있어야** 매일 갱신됨

---

### 3.3 디자인 템플릿 (`/templates`)
- **템플릿 = 조합(combo)**: 썸네일(1번 장) 양식 1 + 내지(2번 장~) 양식 1. **마지막 장 옵션은 없음**(PR #40에서 완전 제거, 재도입하지 않음)
- 목록: **기본 제공** / **내 템플릿** 탭 + 하트 즐겨찾기
  - 기본 제공 순서: 기본 디자인·기본 텍스트 박스 → 인기 8종(PR #42, 인기 게시물 표지 96·내지 94장 분석) → 기타 양식 조합
  - 기본 제공은 수정 불가, 복제해서 사용
- **내 템플릿 만들기**: 한 화면에서 ①썸네일 양식 ②내지 양식 고르고 고치기
  - 양식(`lib/magazine.ts`): 썸네일 13종(classic·photo-bottom·chip·price 등), 내지 24종(textbox·info-table·numbered-list·checklist·ranking·compare·pros-cons·timeline·qa·person·product·quote·essay·memo 등)
  - 수정 항목: 바탕색, 포인트(강조)색, 역할별 글 스타일(글꼴·크기·색·테두리·위치·정렬·글상자), 줄 단위 강조(위·아래 버튼으로 줄 선택, 색 없음 가능), 썸네일 아래 그라데이션 on/off, 워터마크(문구·글꼴·색·진하기·위치)
  - 캡션 CTA 윗줄·아랫줄, 고정 댓글, DM 버튼 안내 문구도 템플릿에 저장
- `[광고]` 표시는 쿠팡 고지라 템플릿에서 끌 수 없음 (결과 화면 토글로만)
- 글꼴: fonts-archive 537종 (`lib/font-catalog.json`, jsDelivr `cdn.jsdelivr.net/gh/fonts-archive/<Repo>/<Repo>.woff2`), 고른 것만 `ensureFont()`로 로드
- 저장: 비로그인 → localStorage(`cardnews.templates.v1`, `cardnews.favorites.v1`, `cardnews.template.active`), 로그인 → `user_data` 표로 계정 동기화 (`lib/cloud-sync.ts`, `GET/PUT /api/me/data`)

---

### 3.4 회원·인증
| 항목 | 내용 |
|---|---|
| 로그인 수단 | 구글, 카카오, 이메일(가입·로그인) — Supabase Auth, 콜백 `/auth/callback` |
| 이용 자격 | 로그인 + **시크릿 코드** 1회 입력 (`POST /api/me/join`) → `members.status = active` |
| 차단 | 관리자가 내보내면 `blocked` → AI 요청 시 "이용이 중지된 계정" 안내 |
| OpenAI 키 | 마이페이지에서 입력 → 서버가 `models.list()`로 유효성 확인 → **AES-256-GCM 암호화**(`lib/secret-box.ts`, `KEY_ENCRYPTION_SECRET`) 후 `user_secrets` 저장, 화면엔 끝 4자리만 (`GET/PUT/DELETE /api/me/key`) |
| 키 사용 | AI 라우트는 `requestApiKey()` → `withApiKey()`(AsyncLocalStorage)로 해당 요청에만 사용자 키 주입. 프롬프트·모델은 서버 고정 |
| 관리자 | `ADMIN_EMAILS`에 있고 + 이메일 인증됨 + **구글 로그인 이력**이 있는 계정만 (`lib/members.ts isAdmin`). 시크릿 코드 불필요, 키 미입력 시 운영자 키(`OPENAI_API_KEY`) 사용 |
| Supabase env 없을 때 | 로그인 없이 서버 `OPENAI_API_KEY` 하나로 동작 (로컬 개발용) |

### 3.5 관리자 모드 (`/admin`)
- **시크릿 코드**: 현재 코드 보기·복사, 직접 정하기(4자 이상), 자동 생성(`DON-XXXXXX`). 바꿔도 기존 회원은 계속 이용 — `GET/PUT /api/admin/settings`
- **가입한 분들**: 전체 / 이용 중 / 코드 미입력 / 내보냄 탭, 이메일 검색, 가입 수단·가입일·마지막 접속 표시
  - 동작: 내보내기(block) / 다시 허용(allow) / 계정 삭제(delete) — `GET/PATCH /api/admin/members` (`{ userId, action }`), 본인 계정은 변경 불가

---

## 4. AI 규칙 (서버 고정)

### 4.1 글 각색 (`lib/remix.ts`, 모델 `OPENAI_TEXT_MODEL`, 기본 `gpt-5-mini`)
- 게시물 종류 판별: `recipe`(음식 레시피) / 일반, `commerce`(광고 여부)
- **레시피 카드뉴스**
  - 슬라이드: 반말 구어체, **이모지 금지**, 내지 정확히 3줄(한 줄 12~18자)
  - 썸네일 제목: **원본 표지 줄 수와 동일**(3줄이면 3줄, 2줄이면 2줄, `matchLines()`로 서버 강제), 원본 표지 정보(매출·지역·순위·메뉴·공개 선언) 빠짐없이. 원본에 없는 수치·재료·분량 **날조 금지**
  - 캡션 본문: 존댓말 `~요`체 정확히 3문장, 문장 끝 이모지 1개씩. CTA 윗줄·아랫줄·쿠팡 고지는 앱이 템플릿대로 조립(`lib/caption.ts`)
  - 자동 DM(`lib/dm.ts`): 고정 인트로 → 🌶️제목 → 재료(줄마다 이모지) → 만드는 법(1️⃣…) → 💡 → 버튼 안내(템플릿) → 쿠팡 고지. **`✨ 비밀재료 2T` 정확히 1줄, 정체·암시 절대 금지**(핵심 BM: 링크 눌러야 알 수 있게)
- **레시피 외(제품 소개 등)**: 원본 말투·사실 유지, 고정 댓글 = `PRODUCT_PINNED_COMMENT`, DM = `PRODUCT_DM` 고정 문구(AI 미사용, `< 0 or 제품명 >` 자리는 사용자가 직접 수정)
- 템플릿 칸 채우기(`lib/fill.ts`, `/api/fill`): 장 내용을 양식 칸에 분배, 썸네일 제목은 고쳐 쓰지 않음(`keepTitle`), 줄 많으면 글자 자동 축소

### 4.2 AI 새 사진 (`lib/image-gen.ts`, 모델 `OPENAI_IMAGE_MODEL`, 기본 `gpt-image-2.5-sunburst`)
- 기본 모드 **edit**(`OPENAI_IMAGE_MODE`, `describe`로 전환 가능)
- 장마다 음식 사진 여부 판별
  - 음식: 원본 이미지 직접 편집 + `input_fidelity: high` + 사전 뒤집기·확대(reframe) → **원본 색감·음식 그대로, 구도만 변경**, 결과를 `sharp`로 원본 색감·채도에 매칭
  - 음식 외: 일반 프롬프트(fidelity 끔), **실존 인물 얼굴·로고 금지**
- 공통: 사진 속 글자·자막·워터마크·`[광고]`·그라데이션·텍스트 박스 **전부 제거**, 미화 표현(전문 푸드포토·윤기 등) 금지, 4:5 출력 후 1080×1350 크롭
- 원본 디자인·배치를 따라가는 방식은 **폐기된 방향**(PR #19). 재도입하지 않음

---

## 5. API 목록

| 메서드·경로 | 설명 | 권한 |
|---|---|---|
| `POST /api/extract` | 인스타 URL → 이미지 URL·캡션 | 공개(인증 검사 없음) |
| `GET /api/image` | 인스타 CDN 이미지 프록시 | 공개(호스트 제한) |
| `POST /api/remix` | 글 각색 (`maxDuration 120`) | 회원 + 키 |
| `POST /api/image-gen` | AI 새 사진 1장 (`maxDuration 240`) | 회원 + 키 |
| `POST /api/fill` | 템플릿 칸 채우기 | 회원 + 키 |
| `GET /api/hot` | 인기 게시물 데이터 (10분 캐시) | 공개 |
| `GET /api/hot/thumb/[code]` | 인기 게시물 썸네일 | 공개 |
| `GET/PUT/DELETE /api/me/key` | OpenAI 키 상태·저장·삭제 | 로그인 |
| `GET/PUT /api/me/data` | 템플릿·즐겨찾기 동기화 | 로그인 |
| `POST /api/me/join` | 시크릿 코드 입력 | 로그인 |
| `GET/PUT /api/admin/settings` | 시크릿 코드 조회·변경 | 관리자 |
| `GET/PATCH /api/admin/members` | 회원 목록·내보내기·허용·삭제 | 관리자 |
| `GET /auth/callback` | OAuth 콜백 | — |

오류는 `UserFacingError` 계열로 한글 안내 문구를 그대로 응답 (`lib/errors.ts`).

---

## 6. 데이터 (Supabase, `supabase/schema.sql`)

모든 표 **RLS on + 정책 없음** → 브라우저에서 직접 접근 불가, 서버(service_role)로만 읽고 씀.

| 표 | 컬럼 | 용도 |
|---|---|---|
| `user_secrets` | user_id, openai_key_enc, key_last4, updated_at | 암호화된 사용자 OpenAI 키 |
| `user_data` | user_id, templates(jsonb), favorites(jsonb), active_template, updated_at | 내 템플릿·즐겨찾기 |
| `members` | user_id, email, status(active/blocked), joined_at | 회원 자격 |
| `app_settings` | id(=1), invite_code, updated_at | 시크릿 코드 (단일 행) |

브라우저 localStorage 키: `cardnews.templates.v1`, `cardnews.template.active`, `cardnews.favorites.v1`, `theme`

---

## 7. 환경변수 (Vercel)

| 변수 | 필수 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase 프로젝트 (바꾸면 재배포) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | 서버 전용, 공개 금지 |
| `KEY_ENCRYPTION_SECRET` | ✅ | 사용자 키 암호화. **바꾸면 저장된 키 전부 복호화 불가** |
| `ADMIN_EMAILS` | ✅ | 관리자 이메일(쉼표 구분) |
| `OPENAI_API_KEY` | ✅ | 운영자 키 (관리자 사용 / 로그인 꺼졌을 때) |
| `OPENAI_TEXT_MODEL` | | 기본 `gpt-5-mini` — **2026-12-11 지원 종료 예정, 교체 필요** |
| `OPENAI_IMAGE_MODEL` | | 기본 `gpt-image-2.5-sunburst` |
| `OPENAI_IMAGE_QUALITY` | | low / medium / high |
| `OPENAI_IMAGE_MODE` | | edit(기본) / describe |
| `NEXT_PUBLIC_ENABLE_IMAGE_GEN` | | `0`이면 AI 사진 기능 숨김 |
| `IG_DOC_ID` | | 인스타 GraphQL doc_id (추출 깨지면 교체) |
| `JINA_API_KEY` | | r.jina.ai 익명 차단(403) 시 |
| `MOCK_LLM` | | `1` = 데모 모드(키 없이 가짜 응답). 운영에선 비움 |

---

## 8. 개발·테스트

```bash
npm install
cp .env.local.example .env.local
npm run dev            # MOCK_LLM=1 이면 키 없이 화면 확인
npm run typecheck
npm run build
npm run test:ai        # 가짜 OpenAI 서버로 요청 형식 확인
npm run test:e2e       # 데모 모드 전체 흐름 (Playwright 별도 설치)
```
- 알려진 테스트 상태: `test:template`은 PR #18 이후 옛 UI 기준이라 깨져 있음, `test:ai`의 이미지 항목 일부는 PR #15 이후 깨져 있음 (미수정)
- 작업 방식: 기능별 브랜치 → PR → `main` 머지 시 Vercel 자동 배포. Vercel 프리뷰는 SSO 보호라 실제 AI 테스트는 운영 URL 또는 로컬

---

## 9. 진행 중 / 남은 과제

| 항목 | 상태 |
|---|---|
| 크레딧 충전 (`credits-charge` 브랜치, `lib/credits.ts`, `supabase/credits.sql`) | 작업 중, 미커밋·미머지 |
| 텍스트 모델 교체 (`gpt-5-mini` 12/11 종료) | 해야 함 — env만 바꾸면 됨, 품질 확인 필요 |
| 두 장 사진 양식 | 미구현 (슬라이드당 사진 1장 구조) |
| 테스트 정비 (`test:template`, `test:ai` 이미지 항목) | 깨진 상태 |
| 인기 게시물 수집 서버화 | 현재 운영자 맥 + Aside 의존 (맥 꺼지면 갱신 중단) |
| README 최신화 | 초기 MVP 설명이 남아 있음 — 이 문서 기준으로 정리 필요 |

### 바꾸지 말아야 할 결정 (운영자 확정 사항)
- 결과 화면에 디자인 편집 기능 넣지 않기 (디자인은 템플릿 탭에서만)
- 마지막 장 템플릿 재도입 금지
- 원본 디자인·배치 복제 방식 재도입 금지
- 로딩 문구에 내부 동작 노출 금지
- DM 비밀재료 정체 노출 금지
