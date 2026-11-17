# ADR 0002 — 콘텐츠 파이프라인

- 상태: 수용
- 날짜: 2026-11-17

## 결정

릴리스 콘텐츠는 로컬 SQLite 파일 `content.sqlite` 하나다. 만드는 순서는 공개 통계, 사람이 리뷰한 산업 분포, 시드된 생성기, 검증, SQLite다.

생성기의 입력 파라미터는 적합 전까지 `placeholder: true`다. 이 플래그가 참인 출력은 샘플이다. v1의 40개 회사라고 부르지 않는다.

원본 공시와 통계 파일은 게임 저장소와 게임 패키지에 넣지 않는다. 분포 파라미터와 시드, 생성기 버전만 남긴다.

## 이유

서버가 없다. 플레이어의 세이브와 콘텐츠 DB는 기기 안에 있다. JSON은 생성기가 검증하고 사람이 diff를 볼 때 쓴다. 게임이 읽는 저장은 SQLite다. 목록과 지도는 `company_cards` 한 페이지다. 행에는 최신 분기의 매출, EBITDA, 천분율 배수, 부채, 현금이 이미 들어 있다. 이력은 `quarters`에 있고, 회사를 열 때 그 키만 읽는다. 조회는 인덱스와 `LIMIT`/`OFFSET`이다. 페이지 상한은 50장이다.

시드를 고정하면 버그를 다시 만들 수 있다. 검증이 항등식을 통과하지 못하면 파일을 쓰지 않는다.

## 결과

`tools/datagen/generate.py`가 그 계약의 첫 구현이다. 전체 이력 픽스처는 `src/data/fixtures/sample-companies.json`이고, 생성기 검사용이다. 클라이언트가 그 파일을 import하지 않는다. 웹 개발 빌드가 가져가는 파일은 `public/sample-page.json` 한 장이다. `tools/datagen/out/`과 `content.sqlite`는 깃에 올리지 않는다. 네이티브 페이지 조회는 `crates/content-db`다.
