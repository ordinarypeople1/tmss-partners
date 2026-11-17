# 화면 토큰

밝은 테마가 기본이다. 바탕은 흰색, 글자는 검정, 강조는 하나다. 짙고 채도가 낮은 카민 `#9B1B30`이다. TMSS OS의 브랜드 토큰을 그대로 쓴다.

| 토큰 | 값 | 쓰는 곳 |
| --- | --- | --- |
| `--page` | `#F3F3F3` | 페이지 바탕. 카드와 떨어뜨리는 회색 |
| `--bg` | `#FFFFFF` | 카드, 선택된 글자 |
| `--surface` | `#FFFFFF` | 표, 지도 위 메모 |
| `--ink` | `#000000` | 본문, 1px 규칙 |
| `--ink-2` | `#2B2B2B` | 보조 본문 |
| `--muted` | `#6B6B6B` | 라벨 |
| `--rule` | `#E3E3E3` | 행 구분 |
| `--rule-strong` | `#000000` | 표의 위쪽 선, 카드 테두리 |
| `--grey` | `#8A8A8A` | 비활성 글자 |
| `--grey-2` | `#C8C8C8` | 비활성 테두리 |
| `--accent` | `#9B1B30` | 주요 동작, 현재 탭, 핵심 숫자, 포커스 |
| `--accent-wash` | `rgba(155, 27, 48, 0.07)` | 토큰만 둔다. 카드 배경으로 쓰지 않는다 |
| `--on-accent` | `#FFFFFF` | 카민 버튼 위의 글자 |

카드 모서리는 14px이다. 그림자와 그라데이션은 없다. 구분은 회색 바탕 위의 흰 면과 간격으로 한다. 선택된 알약은 먹색 면이다. 이익과 손실을 녹색과 적색으로 나누지 않는다. 보통 숫자는 먹색이고, 손실과 핵심 숫자는 카민이다.

화면 모드는 해 또는 달 버튼이다. 처음에는 시스템 설정을 따른다. 고르면 이 브라우저의 `localStorage`에 남는다. 어두운 바탕은 `#0E0E0E`, 면은 `#1C1C1C`, 글자는 `#F4F4F4`다. 카민은 같다.

글꼴은 Pretendard Variable의 동적 서브셋이다. 파일을 저장소에 넣지 않고 링크만 둔다.

`https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css`

Pretendard는 SIL Open Font License다. 출처는 <https://github.com/orioncactus/pretendard>. CDN이 없으면 Apple SD Gothic Neo, 그다음 Malgun Gothic이다. 숫자는 `tabular-nums`다. 한국어 줄바꿈은 `word-break: keep-all`이고, 긴 토큰은 `overflow-wrap: break-word`로 넘긴다.

스토리북은 같은 `styles.css`를 읽는다. 토큰은 컴포넌트와 스토리에 같이 적용된다.
