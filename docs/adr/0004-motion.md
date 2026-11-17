# ADR 0004 — 손맛

- 상태: 수용
- 날짜: 2026-11-17

## 결정

손맛은 화면 레이어에 둔다. 회계 틱과 분리한다. [ADR 0003](0003-simulation.md).

지금 헬로 월드에 넣은 것은 두 가지다.

- 카드는 `motion/react`의 스프링이다. stiffness 420, damping 32. `useReducedMotion()`이 참이면 재생 시간이 0이다.
- 선택된 핀은 CSS `transform`과 `opacity`로 고리를 한 번 늘린다. `prefers-reduced-motion: reduce`에서는 애니메이션을 끈다. `box-shadow`를 프레임마다 그리지 않는다.

탭 피드백으로 `navigator.vibrate(8)`을 부른다. 동작 줄이기가 켜져 있으면 부르지 않는다. 브라우저가 진동을 모르면 아무 일도 하지 않는다.

아래는 다음 단계의 레이어이고, 이 커밋의 의존성이 아니다.

- 핀, 파티클, 딜 클로즈의 WebGL은 PixiJS다. MapLibre 위에 얹는다. 회계를 그리지 않는다.
- 벡터 상태 애니메이션은 Rive다. 런타임을 넣을 때 무료 플랜의 조건(스플래시, 퍼블리시 한도)을 다시 읽고, 런타임 저작권 고지를 남긴다.
- 지도가 이미 하는 드래그와 핀치 위에 길게 누르기가 필요해지면 `@use-gesture/react`를 검토한다. 그 전에는 의존성으로 넣지 않는다.
- 모바일 햅틱은 Tauri 2 haptics 플러그인이다. 플러그인 워크스페이스(v2)의 rust-version은 1.90이고, 지원 표는 Android와 iOS만 `full`, 데스크톱은 `none`이다. 이 환경의 rustc는 1.83이라 플러그인을 의존성에 넣지 않았다. 껍질을 링크할 때 툴체인을 1.90 이상으로 올린 뒤에 모바일 타겟에만 넣는다.

120Hz를 목표로 하는 애니메이션은 `transform`과 `opacity`만 쓴다. 레이아웃을 흔드는 속성은 틱에 넣지 않는다. 저사양 Android 예산은 [ADR 0001](0001-tech-stack.md)과 같다. 손맛 레이어가 그 예산을 넘으면 효과를 줄이고, 시뮬 틱을 늘리지 않는다.

프로토타입의 핀과 카드가 여전히 대시보드면 렌더 레이어를 Godot 또는 Unity로 다시 연다. 회계 크레이트는 Rust로 남긴다. GDScript나 C#으로 재무를 다시 짜지 않는다.

## 확인한 자료

2026-11-17에 아래 주소를 열었다.

- Motion. <https://motion.dev/>. 저장소 <https://github.com/motiondivision/motion>. 라이선스 MIT. 코어는 MIT이고 Motion+는 유료다. 이 저장소는 코어만 쓴다. import 경로는 `motion/react`다.
- Rive 런타임. <https://rive.app/runtimes>, 가격 <https://rive.app/pricing>, React 런타임 저장소 <https://github.com/rive-app/rive-react>. 런타임 라이선스는 MIT다. 무료 플랜은 워터마크와 퍼블리시 한도가 있다. 런타임 로열티는 가격 페이지 기준으로 없다.
- PixiJS. <https://pixijs.com/>. 저장소 <https://github.com/pixijs/pixijs>. 라이선스 MIT.
- use-gesture. <https://use-gesture.netlify.app/>. 저장소 <https://github.com/pmndrs/use-gesture>. 라이선스 MIT.
- Tauri haptics. <https://v2.tauri.app/plugin/haptics/>. 설명은 Android와 iOS의 햅틱이다. 플러그인 Cargo.toml의 플랫폼 표와 워크스페이스 `rust-version = "1.90"`은 <https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/haptics> 에서 확인했다.

## 결과

카드 스프링과 핀 고리, 동작 줄이기, 웹 진동의 빈 동작이 헬로 월드에 있다. Pixi, Rive, use-gesture, Tauri haptics는 문서에만 있다.
