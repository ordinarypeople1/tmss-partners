# Deal Atlas

Poiesis Investment의 딜을 지도 위에서 고르는, 한 사람의 커리어 시뮬레이션입니다.
가제는 **Deal Atlas**, 플레이어의 하우스는 **Poiesis Investment**입니다.

현실의 사모펀드(Private Equity, PE)와 벤처투자(Venture Capital, VC)가 실제로 움직이는 방식에 가깝게 만드는 것이 이 게임의 가치입니다. 주가는 없습니다. 회사의 가치는 펀더멘털이고, 가격은 거래가 성사되는 순간에만 생깁니다.

문서는 한국어로 쓰고, 코드와 식별자는 영어로 둡니다.

## 한 줄

2024년의 고금리 속에서, 미국의 중소형 사모펀드 Poiesis Investment에 VP로 입사한다. 입사한 날 새 블라인드 펀드가 운용을 시작한다. 지도에서 가공의 회사를 소싱하고, 실사하고, 투자심의위원회(Investment Committee, IC)를 통과해 인수하고, 운영하고, 살아 있는 시장에 판다. 펀드의 10년이 커리어의 시계다.

## 기둥

1. **펀더멘털 가치.** 기업가치는 EBITDA에 배수를 곱한 값이다. 배수는 금리 국면과 섹터 사이클, 회사의 질로 움직인다. 틱커도, 랜덤 워크 주가도 없다.
2. **거래 순간에만 가격.** 경매, 상장(IPO), 엑시트에서만 청산 가격이 생긴다. 그 사이의 숫자는 모델 가치다.
3. **식별되지 않는 현실.** 지도는 실제 지리를 쓰고, 회사는 절차적으로 만든 가공의 회사다. 실존 회사를 알아볼 수 없게 배치한다.
4. **살아 있는 시장.** 회사마다 주인이 있고, 주인에게 팔 이유가 생겨야 매물이 나온다. 경쟁 하우스와 전략적 매수자가 같은 매물에 들어온다.
5. **손에 잡히는 지도.** 지도가 판이고 표는 서랍이다. 매물, 보유 회사, 섹터, 소유 구도가 레이어로 보인다.
6. **숫자보다 그림.** 브리지, 게이지, 타워, 레이더가 문장을 대신한다.

## 지금 되는 것

- 미국 24개 주, 6개 섹터, 250개 가공 회사. 전부 매달 3제표를 닫는다
- 금리, 경기 국면, 신용 스프레드, 섹터 사이클
- 거시 일정: FOMC·ECB·인민은행, 미국·유로존·중국 지표, 미국 선거. 서프라이즈가 시장을 민다
- 매물 엔진: 은퇴, 승계, 펀드 회수, 비핵심 정리, 부실. 유니버스의 5–10%가 매물
- 딜: NDA, 실사 4종과 숨은 이슈, LBO 구조화, 여섯 파트너의 IC, 경매와 독점 협상
- 보유: 월 자본 예산, 이니셔티브 8종, 코버넌트, 볼트온, 배당 리캡, 엑시트 3종
- 펀드: 콜과 분배, 관리보수, DPI·TVPI·IRR, 캐리
- 커리어: 평판, VP에서 창업까지의 승진, 다음 펀드
- 화면: 지도 허브, 인박스, 캘린더, 딜 파이프라인과 딜 룸, 포트폴리오, 시장, 펀드, 커리어

규칙과 숫자는 [구현된 시스템](docs/gdd/systems.md), 계획은 [개발 로드맵](docs/gdd/roadmap.md)에 있다. 숫자는 전부 자리표시자다. 싱글 플레이, 오프라인, 서버 없음. 통화는 미국 달러 하나이고 나라는 일곱(미국, 영국, 독일, 프랑스, 대한민국, 일본, 중국)을 받는 구조이나, 지금 회사가 있는 곳은 미국이다.

## 저장소

| 경로 | 내용 |
| --- | --- |
| `docs/gdd/` | 게임 디자인 |
| `docs/personas/` | 플레이어, Poiesis Investment, 파트너 |
| `docs/scenarios/` | 이벤트 카탈로그 |
| `docs/finance/` | 3제표, 밸류에이션, LBO, 변제 순위 |
| `docs/legal/` | 데이터 사용 메모. 법률 자문이 아니다 |
| `docs/adr/` | 기술 결정 |
| `docs/i18n/` | 문자열 절차. 소스 로케일은 한국어 하나 |
| `docs/ux/` | 손맛 |
| `docs/references/` | 확인된 참고 자료 |
| `crates/sim-core/` | 시뮬 전체. 경제, 회사, 매물, 딜, 보유, 펀드, 뷰. 네이티브와 wasm |
| `crates/content-db/` | SQLite 카드 페이지 |
| `crates/app-commands/` | Tauri가 부를 커맨드 |
| `src-tauri/` | Tauri 2.1 껍질. 이 환경에서는 링크하지 않음 |
| `src/sim/` | wasm 로더와 뷰 타입. 식을 다시 짜지 않음 |
| `src/i18n/` | 한국어 카탈로그(공용 + 화면별 조각)와 검사 |
| `src/data/` | 지리 메타데이터(7개 나라, 187개 지역)와 생성기 검사용 픽스처 |
| `src/ui/` | 화면. 게임 스토어, 셸, 지도 허브, 차트 부품, 화면들 |
| `public/content/` | 생성기가 만든 첫날의 유니버스 |
| `tools/dev/` | 개발용 Playwright 드라이버 |
| `assets/` | 직접 만든 에셋만. 큰 외부 에셋은 넣지 않는다 |
| `tools/datagen/` | 가공 회사와 3제표 생성. 산업 분포와 주 프로파일 |

## 실행

```bash
npm install
npm test
npm run dev
```

`npm test`는 wasm 바인딩, 지도 경계, `cargo test`, TypeScript, Vitest를 순서대로 돌린다. rustc와 `wasm32-unknown-unknown`, `wasm-bindgen` 0.2.100이 필요하다. 브라우저에서 `http://127.0.0.1:5173/` 을 연다. 게임은 매달 브라우저에 저장되고, 다시 열면 이어진다.

콘텐츠를 다시 만들 때 (Python 표준 라이브러리만 사용):

```bash
node tools/build-geo.mjs
python3 tools/datagen/generate.py --check
```

스토리북:

```bash
npm run storybook
```

`http://127.0.0.1:6006/` 에서 차트 부품을 본다. `npm run build`는 앱과 스토리북을 같이 만든다. 앱은 `dist/`, 스토리북은 `dist/storybook/`이다.

자동 플레이 보고서. 신중한 봇이 10년을 돌린 성과를 시드별로 찍는다. 밸런스를 볼 때 쓴다.

```bash
cargo test -p sim-core report -- --ignored --nocapture
```

## 휴대폰에서 보기

GitHub Actions(`.github/workflows/pages.yml`)가 `main`에 푸시되면 `gh-pages` 브랜치 루트에 앱을, `storybook/`에 스토리북을 올린다. 같은 저장소의 풀 리퀘스트는 `preview/pr-<번호>/`에 올라간다. 기본 주소는 프로젝트 페이지다.

- 앱: `https://ordinarypeople1.github.io/tmss-partners/`
- 스토리북: `https://ordinarypeople1.github.io/tmss-partners/storybook/`
- 이 풀 리퀘스트 미리보기: `https://ordinarypeople1.github.io/tmss-partners/preview/pr-1/`
- 그 스토리북: `https://ordinarypeople1.github.io/tmss-partners/preview/pr-1/storybook/`

커스텀 도메인으로 루트가 `/`여야 하면 저장소 변수 `PAGES_BASE`를 `/`로 둔다. 홈 화면에 추가하면 `manifest.webmanifest`의 `display: standalone`으로 브라우저 크롬 없이 열린다.

이 워크플로는 `main`에 있어야 실행된다. 페이지를 켜는 설정은 저장소 주인이 해야 한다. 저장소가 비공개이고 계정이 GitHub Free이면 비공개 저장소의 Pages는 쓸 수 없다.

데스크톱과 모바일 패키징은 Tauri 2로 정했다. `src-tauri`는 2.1 소스이고, WebKit이 있는 머신에서 링크한다. 이유는 [ADR 0001](docs/adr/0001-tech-stack.md)에 있다. 문자열은 한국어만 외부화해 두었고, 다른 언어는 문장이 잠긴 뒤에 넣는다. [절차](docs/i18n/workflow.md).

## 라이선스

라이선스는 아직 정하지 않았다. [LICENSE](LICENSE)는 권리를 허락하는 문서가 아니다. 소유자가 고른 뒤에야 배포 조건이 생긴다.
