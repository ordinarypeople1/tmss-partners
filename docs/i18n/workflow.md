# 문자열

화면 문장은 한국어 카탈로그에만 있다. 공용 용어는 `src/i18n/locales/ko.json`에, 화면별 문장은 `src/i18n/locales/ko/` 아래 조각 파일에 있다. 조각은 자기 접두어(`map.`, `inbox.` …)의 키만 갖고, 한 키는 한 곳에만 정의한다. `src/i18n/messages.ts`가 합친다. 소스 로케일은 `ko`다. `src/i18n/config.ts`의 `LOCALES`는 `ko`, `en`, `ja`, `zh-Hans`이고 `PLANNED_LOCALES`는 `zh-Hant`다. 한국어로 먼저 쓰고, 나머지는 같은 파일 구조(`locales/<로케일>.json`, `locales/<로케일>/*.json`)로 옮긴다. 번역은 기계가 초벌을 냈고 원어민 검수 전이다. 그 파일은 아직 만들지 않는다. 개발 중에 문장이 계속 바뀌므로, 번역은 화면 문장이 잠긴 뒤에 한 번 한다.

## 지금 하는 일

- 플레이어가 읽는 문장은 메시지 키다. JSX 텍스트, `aria-label`, `title`, `alt`, `placeholder`에 문장을 적지 않는다.
- 한국어 카탈로그가 ICU를 쓴다. 수량과 숫자. 연도는 `{value, number, ::integer group-off}`다. `group-off`가 없으면 2012가 2,012가 된다.
- 회사 이름과 단지 이름은 콘텐츠 데이터이고 번역하지 않는다. 주 이름은 `admin1.<코드>`, 섹터는 `sector.<id>`로 키를 고른다.
- 레이아웃은 문장이 길어져도 깨지지 않게 잡는다. `flex-wrap`, `minmax(0, …)`, `repeat(auto-fit, minmax(9rem, 1fr))`, `overflow-wrap: anywhere`. 표의 칸, 칩, 버튼은 한 줄로 두고 넘치면 말줄임표로 자른다(`src/ui/styles.css`의 `.table td`, `.clip`). 줄바꿈 금지는 그 공용 시트에서만 선언하고, 화면별 CSS에는 `nowrap`을 넣지 않는다. 회사 이름은 목록과 표에서 약칭(`row.short`)을 쓴다.
- 글꼴은 벤더하지 않는다. 런타임에 Google Fonts CDN을 부르지 않는다. 게임은 오프라인이다. 패키징할 때 필요한 글자만 서브셋한다.
  - 한국어: Pretendard, 이어서 Noto Sans KR. Pretendard는 OFL이다. <https://github.com/orioncactus/pretendard>
  - 일본어를 넣을 때: Noto Sans JP. <https://fonts.google.com/noto/specimen/Noto+Sans+JP>
  - 간체: Noto Sans SC. <https://fonts.google.com/noto/specimen/Noto+Sans+SC>
  - 번체: Noto Sans TC. <https://fonts.google.com/noto/specimen/Noto+Sans+TC>
  - Noto CJK 소스: <https://github.com/notofonts/noto-cjk>
  - OFL 본문: <https://openfontlicense.org/>
- CSS는 이미 `:lang(ja)`, `:lang(zh-Hans)`, `:lang(zh-Hant)` 글꼴 스택을 갖고 있다. 카탈로그가 생기기 전에는 `html`의 언어가 `ko`라 그 스택이 쓰이지 않는다.

돈은 달러 하나다. 천 달러 정수를 `formatUsdThousand`가 카탈로그의 단위(`money.usd.*`)로 포맷한다. 로케일이 늘면 단위 문장만 그 로케일의 것으로 넣는다(영어는 K, M, B). 환율은 없다.

나중에 넣을 규모 문장의 틀은 이렇다. 이것은 카탈로그가 아니다.

```
{value, number, ::.##} million
{value, number, ::.##} billion
```

한국어는 지금 `money.krw.million`, `money.krw.eok`, `money.krw.jo`가 그 역할을 한다.

## 잠긴 뒤에 하는 일

1. `ko.json`의 키를 얼린다. 이후 문장 변경은 번역 수정과 같이 간다.
2. `PLANNED_LOCALES` 순서로 `locales/en.json`, `locales/ja.json`, `locales/zh-Hans.json`, `locales/zh-Hant.json`을 만든다. 키 집합은 `ko.json`과 같아야 한다. 빈 파일을 미리 두지 않는다.
3. `LocaleProvider`에 그 카탈로그를 등록하고, 언어 전환을 연다. `document.documentElement.lang`을 그 로케일로 바꾼다.
4. 용어집의 빈 칸을 채운다. 용어 id는 바꾸지 않는다.
5. 복수형은 그 언어의 ICU 규칙으로 다시 적는다. 한국어 카탈로그의 `other` 하나만으로는 영어의 `one`이 생기지 않는다.
6. 글꼴 서브셋을 패키지에 넣고, 라이선스 고지를 배포물에 남긴다.

## 검사

`src/i18n/checkUiStrings.ts`가 `src/ui`의 TSX를 본다. JSX 텍스트에 글자가 있거나, `aria-label` `title` `alt` `placeholder`가 문자열 리터럴이거나, 한글·가나·한자 리터럴이 있으면 실패한다. 메시지 id, 클래스 이름, 한 단어 토큰은 통과한다. `*.stories.tsx`는 빼 둔다. 스토리북 문장은 `stories/`에 있고, 화면 크롬은 같은 `ko.json` 키를 쓴다. 회사 이름처럼 콘텐츠 데이터인 문자열만 스토리 인자로 둔다. `npm test`가 이 검사를 돌린다. 카탈로그 테스트는 `locales` 안에 `ko.json`만 있는지도 본다.

## 용어

id는 고정한다. 한국어가 소스다. 목표 언어는 문장이 잠긴 뒤에 채운다. 지금 비어 있는 칸에 번역을 넣지 않는다.

| id | ko | en | ja | zh-Hans | zh-Hant |
| --- | --- | --- | --- | --- | --- |
| enterprise_value | 기업가치 |  |  |  |  |
| equity_value | 지분가치 |  |  |  |  |
| ebitda | EBITDA |  |  |  |  |
| net_debt | 순차입금 |  |  |  |  |
| model_multiple | 모델 배수 |  |  |  |  |
| investment_committee | 투자심의위원회 |  |  |  |  |
| carry | 캐리 |  |  |  |  |
| covenant | 코버넌트 |  |  |  |  |
| dividend_recap | 배당 재자본화 |  |  |  |  |
| stalking_horse | 스토킹 호스 |  |  |  |  |
| add_on | 볼트온 |  |  |  |  |
| continuation_fund | 컨티뉴에이션 펀드 |  |  |  |  |

플레이어 직함 VP는 부사장으로 옮기지 않는다. 용어 id는 `player_title_vp`이고, 한국어 표기는 문장이 잠길 때 `ko.json`의 직함 키와 같이 정한다. 지금은 헬로 월드에 그 키가 없다.

## 검사

- `src/i18n/checkUiStrings.test.ts`: `src/ui` 아래에 하드코딩된 문장이 없는지, 공용 시트 밖의 스타일시트에 `nowrap`이 없는지 본다.
- `src/i18n/catalog.test.ts`: 키가 두 번 정의되지 않았는지, 화면이 쓰는 `t("…")` 키가 전부 있는지, 지도의 187개 지역과 7개 나라에 이름이 있는지 본다.
- 같은 테스트가 로케일마다 한국어 키가 전부 있는지, ICU 인자 이름이 같은지 본다. 돈은 모든 로케일이 미국식 K, M, B, T(`money.usd.k/m/b/t`)로 쓴다.
