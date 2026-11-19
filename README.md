# Deal Atlas

TMSS Partners의 딜을 지도 위에서 고르는, 한 사람의 커리어 시뮬레이션입니다.
가제는 **Deal Atlas**, 플레이어의 하우스는 **TMSS Partners**입니다.

현실의 사모펀드(Private Equity, PE)와 벤처투자(Venture Capital, VC)가 실제로 움직이는 방식에 가깝게 만드는 것이 이 게임의 가치입니다. 주가는 없습니다. 회사의 가치는 펀더멘털이고, 가격은 거래가 성사되는 순간에만 생깁니다.

문서는 한국어로 쓰고, 코드와 식별자는 영어로 둡니다.

## 한 줄

2024–2026년의 고금리 속에서, 미국의 중소형 사모펀드에서 일하는 미드 레벨 투자 전문가(VP)가 가공의 회사를 소싱하고, 투자심의위원회(Investment Committee, IC)를 통과하고, 인수한 뒤 살아 있는 시장과 함께 엑시트한다.

## 기둥

1. **펀더멘털 가치.** 기업가치는 EBITDA에 배수를 곱한 값이다. 배수는 금리 국면과 섹터 사이클로 움직인다. 틱커도, 랜덤 워크 주가도 없다.
2. **거래 순간에만 가격.** 경매, 상장(IPO), 엑시트, 법원 매각에서만 청산 가격이 생긴다. 그 사이의 숫자는 모델 가치다.
3. **식별되지 않는 현실.** 지도는 실제 지리를 쓰고, 회사는 절차적으로 만든 가공의 회사다. 실존 회사를 알아볼 수 없게 배치한다.
4. **스펙트럼.** 시리즈 A 이후의 VC, 그로스, 바이아웃과 LBO, 부실·도산 인수를 한 커리어 안에서 다룬다.
5. **살아 있는 시장.** 매도자, 매수자, 증권사, 대주, LP, 경영진, 노동조합, 규제 기관, 언론이 각자 움직인다.
6. **손에 잡히는 지도.** 공장, 설비, 점포, 창고가 핀과 그림 카드로 보인다. 따뜻하고 단정한 화면이다.

## v1

한 시나리오, 한 커리어, 한 시대(2024–2026 고금리).

- 지도: 미국이 홈, 유럽·대한민국·일본·중국은 크로스보더
- 섹터 3개: 식품 제조, 산업 부품, 냉장·창고 물류 (제안)
- 가공 회사 약 40개
- IC
- 이벤트 12개

다른 시대, 다른 모드, 하우스 선택, 해외 지역은 확장이다. 싱글 플레이, 오프라인, 서버 없음.

## 로드맵

1. **지금.** 설계 문서, 기술 선택, 콘텐츠 생성기의 첫 파이프. 화면은 지도와 카드가 샘플 회사를 보여주는 수준이다.
2. **수직 조각.** 회사 40개, 분기 3제표, 모델 배수, 딜 하나(바이아웃)가 IC를 통과해 클로징까지 간다.
3. **v1.** 세 섹터, IC의 재량 한도, 이벤트 12개, 인수 후 운영 레버, 저장은 로컬 SQLite.
4. **그 다음.** 그로스와 부실, 나머지 이벤트, LP 보고, 승진과 캐리. 그 뒤에 다른 시대와 지역.

부트스트랩 이후의 계획과 잠근 결정은 [개발 로드맵](docs/gdd/roadmap.md)에 있다. 달러 단일 통화, 미국의 중소형 PEF, 다섯 지역(미국, 유럽, 대한민국, 일본, 중국), 지도 메인 화면, VP에서 창업까지의 역할 사다리, 월 틱.

## 저장소

| 경로 | 내용 |
| --- | --- |
| `docs/gdd/` | 게임 디자인 |
| `docs/personas/` | 플레이어, TMSS Partners, 파트너 |
| `docs/scenarios/` | 이벤트 카탈로그 |
| `docs/finance/` | 3제표, 밸류에이션, LBO, 변제 순위 |
| `docs/legal/` | 데이터 사용 메모. 법률 자문이 아니다 |
| `docs/adr/` | 기술 결정 |
| `docs/i18n/` | 문자열 절차. 소스 로케일은 한국어 하나 |
| `docs/ux/` | 손맛 |
| `docs/references/` | 확인된 참고 자료 |
| `crates/sim-core/` | 시뮬. 네이티브와 wasm |
| `crates/content-db/` | SQLite 카드 페이지 |
| `crates/app-commands/` | Tauri가 부를 커맨드 |
| `src-tauri/` | Tauri 2.1 껍질. 이 환경에서는 링크하지 않음 |
| `src/sim/` | wasm 로더. 식을 다시 짜지 않음 |
| `src/i18n/` | 한국어 카탈로그와 검사 |
| `src/data/` | 페이지 타입. 전체 이력 JSON은 클라이언트가 읽지 않음 |
| `src/ui/` | 화면 |
| `assets/` | 직접 만든 에셋만. 큰 외부 에셋은 넣지 않는다 |
| `tools/datagen/` | 가공 회사와 3제표 생성 |

## 실행

콘텐츠 생성 (Python 표준 라이브러리만 사용):

```bash
python3 tools/datagen/generate.py --check
```

화면과 시뮬:

```bash
npm install
npm test
npm run dev
```

`npm test`는 wasm 바인딩, `cargo test`, TypeScript, Vitest를 순서대로 돌린다. rustc와 `wasm32-unknown-unknown`, `wasm-bindgen` 0.2.100이 필요하다. 브라우저에서 `http://127.0.0.1:5173/` 을 연다. 샘플 4개 회사는 자리표시자 분포로 만든 가공의 회사다. 화면은 카드 페이지 한 장을 가져오고, 기업가치는 Rust wasm이 계산한다.

스토리북:

```bash
npm run storybook
```

`http://127.0.0.1:6006/` 에서 카드, 목록, 핀, 금액, 상태 문장을 본다. 툴바의 Motion으로 동작 줄이기를 켠다. 스토리는 `ko.json` 키를 쓰고, `*.stories.tsx`는 하드코딩 검사에서 빠진다.

`npm run build`는 앱과 스토리북을 같이 만든다. 앱은 `dist/`, 스토리북은 `dist/storybook/`이다. 로컬 프리뷰에서는 앱이 `/`, 스토리북이 `/storybook/`이다.

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
