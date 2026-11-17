# 엔진과 프레임워크

싱글 플레이, 오프라인, 데스크톱과 모바일을 같이 보는 선택지다. 고른 스택은 [ADR 0001](../adr/0001-tech-stack.md)이다.

## Godot

- 주소: <https://godotengine.org/>
- 라이선스: MIT. <https://godotengine.org/license/> 엔진을 배포할 때 고지가 필요하다. 게임 콘텐츠의 라이선스는 따로다.
- 이유: 2D 지도, 카드, 데스크톱·모바일 수출이 한 프로젝트에 있다. 문서 형 재무 UI와 지리 투영은 직접 만들어야 한다. 카드 프로토타입이 표처럼만 느껴지면 다시 본다.

문서 입구: <https://docs.godotengine.org/en/stable/about/introduction.html>

## Unity

- 주소: <https://unity.com/products>
- 비용: Personal은 직전 12개월 매출·조달 20만 달러 이하에서 무료. 그 위는 Pro가 필요하고, 2026년 가격 안내 기준 시트당 연 2,310달러 또는 월 210달러다. <https://unity.com/products/pricing-updates>
- 런타임 피: 2024-09-12에 철회. 어떤 Unity 버전에도 적용하지 않는다고 적혀 있다. <https://unity.com/blog/unity-is-canceling-the-runtime-fee>
- 이유: 수출과 모바일 경험은 넓다. 시트 비용과, 한글 문서·오프라인 벡터 지도를 엔진 안에서 짜는 비용이 있다.

## Bevy

- 주소: <https://bevy.org/> (`bevyengine.org`가 여기로 이어졌다)
- 저장소: <https://github.com/bevyengine/bevy>
- 라이선스: MIT 또는 Apache-2.0.
- 이유: ECS로 에이전트 시뮬을 짜기 좋다. 조밀한 재무 UI와 모바일 패키징은 이 게임의 첫 리스크다. 런타임으로 고르지 않았다.

## Tauri 2

- 주소: <https://v2.tauri.app/>
- 2.0 안정판 발표(2024-10-02): <https://v2.tauri.app/blog/tauri-20/>
- 저장소: <https://github.com/tauri-apps/tauri>
- 라이선스: MIT와 Apache-2.0. `LICENSE-MIT`, `LICENSE-APACHE-2.0`.
- SQL 플러그인: <https://v2.tauri.app/plugin/sql/>
- 이유: 고른 껍질. 웹 UI를 데스크톱과 iOS, Android로 감싼다. 서버가 필요 없다. 발표문은 모바일 플러그인이 데스크톱보다 적고, 개발 경험이 아직 데스크톱만 못하다고 적는다.

## Capacitor

- 주소: <https://capacitorjs.com/>
- 라이선스: MIT. Ionic(Drifty) 저작권 고지.
- 이유: Tauri 모바일 셸이 막힐 때 같은 Vite 앱을 감싸는 대체 껍질.

## React

- 주소: <https://react.dev/>
- 라이선스: MIT.
- 이유: IC 메모, 3제표, 카드. 한글 조판과 접근성이 게임 엔진 UI보다 직접적이다.

## Vite

- 주소: <https://vite.dev/>
- 라이선스: MIT.
- 이유: 개발 서버와 빌드. 헬로 월드가 이것으로 실행된다.

## PixiJS

- 주소: <https://pixijs.com/>
- 라이선스: MIT.
- 이유: 일러스트 핀이 HTML 마커를 넘어서면 맵 위 캔버스 레이어로 붙인다. v1 의존성에는 넣지 않는다.

## Phaser

- 저장소: <https://github.com/phaserjs/phaser>
- 라이선스: MIT.
- 이유: 2D 게임 루프의 비교 대상. 공식 사이트 `phaser.io`는 이 환경의 단순 클라이언트에 403을 줬다. 본문을 확인한 주소는 저장소다.
- 이 게임에 당장 쓰지 않는 이유: 문서형 UI와 MapLibre가 먼저다.

## 로컬 SQLite를 JS에서

- sql.js: <https://github.com/sql-js/sql.js> MIT. 브라우저 안의 SQLite. Tauri 없이 웹 프리뷰에서 콘텐츠 DB를 열 때.
- better-sqlite3: <https://github.com/WiseLibs/better-sqlite3> MIT. 생성기와 데스크톱 도구의 네이티브 바인딩. 파이프라인은 지금 Python `sqlite3`를 쓴다.
