# AI로 개발할 때

에이전트가 재무 규칙을 지어내거나, 실존 회사를 콘텐츠에 넣거나, 라이선스를 혼자 고르지 않게 하는 도구다.

## Cursor

- 프로젝트 규칙: <https://cursor.com/docs/rules> 이 저장소의 규칙은 `.cursor/rules/`에 있다. 한글 문서, 백만 원 정수, 오프라인, 가공의 이름, 라이선스 미정이 항상 적용된다.
- 스킬: <https://cursor.com/docs/skills> 반복 절차가 생기면 스킬로 뺀다. 후보 두 가지. 콘텐츠 생성 후 항등식 검증, 지도 스타일에서 POI를 뺐는지 확인.
- 스킬 표준의 입구: <https://agentskills.io/home>
- 플러그인: <https://cursor.com/docs/plugins> 규칙, 스킬, MCP를 묶을 때.
- MCP: <https://cursor.com/docs/mcp>
- 공식 마켓: <https://cursor.com/marketplace> 커뮤니티 디렉터리는 문서가 안내하지만, 직접 열었을 때 429라 본문은 확인하지 못했다. 서버를 고를 때 다시 연다.

## MCP

- 프로토콜 입구: <https://modelcontextprotocol.io/> 점검 당시 버전이 적힌 소개 문서로 이어졌다.
- 서버 모음: <https://github.com/modelcontextprotocol/servers> 파일, git, 브라우저 같은 참조 구현의 목록. 게임을 대신 짜는 서버가 아니다.
- Playwright: <https://github.com/microsoft/playwright-mcp> 지도 핀, IC 화면, 좁은 폭의 회귀를 에이전트가 눌러 보게 할 때.
- GitHub: <https://github.com/github/github-mcp-server> 이슈와 풀 리퀘스트가 쌓이면 저장소 맥락을 읽힐 때. 쓰기 권한은 최소로 둔다.
- Context7: <https://github.com/upstash/context7> MapLibre, Tauri, Vite의 현재 문서를 끌어올 때. 모델이 예전 API를 지어내는 것을 줄인다.

## 엔진 플러그인

Godot이나 Unity용 AI 플러그인은 이 목록에 없다. 그 엔진을 고르지 않았고, 확인한 공식 플러그인 페이지가 없다. 스택을 바꾸면 ADR 0001과 함께 다시 조사한다.

## 시키지 않는 것

- 실존 회사의 공시를 붙여 넣고 “비슷하게 바꿔”라고 시키기.
- 라이선스 파일을 에이전트가 MIT로 채우게 하기.
- 지도 타일에 상호 레이어를 남긴 채 핀을 찍기.
- 워터폴을 도산법 조문의 번역이라고 주석 달기.
