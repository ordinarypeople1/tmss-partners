# 참고 자료

Deal Atlas를 만들 때 실제로 열어 볼 자료만 모았다. 2026-11-17에 링크를 확인했다. 본문이 돌아온 주소만 올린다. 단순 HTTP 클라이언트가 403을 받고, 브라우저형 조회에서 본문이 돌아온 경우는 그 사실을 적었다. 추측으로 만든 주소는 없다.

각 항목은 이름, 주소, 라이선스 또는 비용, 이 게임에 쓰는 이유다. 라이선스는 그날 읽은 범위만 적는다. 배포 전에 해당 파일을 다시 연다.

확인하지 못한 후보는 맨 아래 절에만 둔다. 그 절의 주소는 참고 목록에 넣은 것이 아니다.

| 문서 | 내용 |
| --- | --- |
| [엔진과 프레임워크](engines.md) | Godot, Unity, Bevy, Tauri, Capacitor, React, Pixi, Phaser |
| [지도](maps.md) | Natural Earth, OSM, MapLibre, 한국 공개 데이터 |
| [에이전트와 ECS](simulation.md) | bitECS, flecs, Bevy, Mesa |
| [재무 라이브러리](finance.md) | IRR, LBO 교재, 제표 |
| [합성 데이터](synthetic-data.md) | 이름, 분포, 공시, 통계 |
| [그림과 UI](art-and-ui.md) | 에셋, 아이콘, 한글 글꼴 |
| [오디오](audio.md) | 효과음과 음악 |
| [비교할 게임](games.md) | PE, VC, 타이쿤, Sky Routes |
| [도메인](domain.md) | 책, 강의, 용어 |
| [AI 개발 도구](ai-tooling.md) | Cursor rules, skills, MCP |

## 확인하지 못한 후보

아래는 이름이 오가지만, 이 환경에서 본문을 받지 못했다. 목록에 넣지 않는다.

- 브이월드(`vworld.kr`)는 연결이 중간에 끊겼다.
- OECD 포털의 `https://www.oecd.org/en/data.html` 은 403이었다. 데이터 탐색기는 [합성 데이터](synthetic-data.md)에 있다.
- Investopedia의 LBO·PE 용어 페이지는 403이라 본문을 확인하지 못했다.
- CFA Institute 용어집 후보 경로 `https://www.cfainstitute.org/insights/glossary` 는 404였다. 협회 홈은 열렸으나 용어집이 아니다.
- Wiley의 Mastering Private Equity 상품 후보는 열리지 않았다.
- Feist 판결의 Justia 주소는 403이었다. 사실과 저작권은 미국 저작권청 안내로 대신 확인했다. [데이터 사용 메모](../legal/data-usage.md).
