# Deal Atlas — 작업 규칙

문서는 한국어, 코드와 식별자는 영어. 개요는 [README](README.md), 규칙과 숫자는 [구현된 시스템](docs/gdd/systems.md).

## 1차 출시는 Steam이다

[ADR 0006](docs/adr/0006-steam-first.md). 기준 플랫폼은 Windows 데스크톱(Tauri 2, WebView2)이고 macOS와 Steam Deck이 뒤를 잇는다. 모바일은 그 뒤다. 폰 레이아웃은 깨지지 않게만 지킨다. 기능을 만들 때마다 아래를 지킨다.

### 입력

- 모든 동작은 마우스만으로, 키보드만으로 할 수 있어야 한다. 호버로만 보이는 정보와 터치 전용 제스처를 두지 않는다.
- 자주 쓰는 동작에는 단축키를 둔다. 대화 상자는 Esc로 닫고, Tab은 그 안에 갇힌다.
- 포커스가 항상 보이고 순서가 화면 순서와 같다. Steam Deck의 컨트롤러 조작이 이 위에 얹힌다.

### 화면

- 1280×800(Steam Deck)과 1920×1080에서 확인한다. 1280×800에서 본문 글자는 12px 이상이다.
- 창 크기를 고정으로 가정하지 않는다. 최소 창은 1024×640이다(`src-tauri/tauri.conf.json`).
- 데스크톱에서는 게임을 끝낼 길이 있어야 한다(타이틀의 종료).

### 저장

- 저장은 `src/ui/saveStore.ts`만 거친다. 화면이 IndexedDB, 파일, Steam API를 직접 부르지 않는다. 패키지 빌드는 이 경계를 앱 데이터 폴더의 파일로 바꾸고, Steam Auto-Cloud가 그 폴더를 동기화한다.
- 출시 뒤에는 세이브를 깨뜨리지 않는다. `SAVE_SCHEMA_VERSION`(`crates/sim-core/src/world.rs`)을 올리면 이전 버전을 읽는 마이그레이션을 같이 넣는다. 지금은 버전이 다르면 새 게임이 된다. 출시 전까지만 허용한다.
- 저장은 지금 약 6MB다. 크게 늘리는 변경은 크기를 재고 적는다.

### 플랫폼 연동

- Steam, Tauri, 운영체제 API는 플랫폼 경계([ADR 0005](docs/adr/0005-platform-accounts.md)의 `Platform`) 뒤에 둔다. 화면 코드는 `window.__TAURI__`나 Steamworks를 직접 모른다.
- 웹 빌드(`npm run dev`, GitHub Pages)는 계속 돈다. 플랫폼 기능이 없으면 조용히 빠진다.
- 업적 id(`Achievement`, `src/sim/types.ts`)는 Steamworks 업적 API 이름과 1:1이다. 출시 뒤에는 id를 바꾸거나 지우지 않는다. 새 업적은 추가만 한다.
- 자체 계정, 서버, 로그인 화면을 만들지 않는다.

### 빌드와 보안

- 릴리스 빌드는 네트워크를 부르지 않는다. 글꼴, 지도 타일, 이미지는 모두 번들 안에 있다.
- 웹뷰 CSP(`src-tauri/tauri.conf.json`)를 넓히지 않는다. 인라인 스크립트와 외부 출처를 쓰지 않는다. 넓혀야 하면 이유를 ADR에 적는다.
- `npx tauri build --no-bundle`이 계속 통과해야 한다. Windows 실행 파일은 `.github/workflows/desktop.yml`이 만든다.

### 콘텐츠

- 실존 회사, 인물, 브랜드를 알아볼 수 없게 둔다([데이터 사용 메모](docs/legal/data-usage.md)).
- 외부 에셋은 라이선스를 크레딧 목록에 옮긴 뒤에만 넣는다. Steam 출시는 모든 에셋의 배포 권리를 요구한다.
- 플레이어가 읽는 문장은 전부 i18n 키다([절차](docs/i18n/workflow.md)). 4개 로케일이 Steam 스토어의 지원 언어가 된다.

## 확인

- `npm test`: wasm, 지도 경계, `cargo test`, TypeScript, Vitest, 하드코딩 문자열 검사.
- 화면 변경은 `tools/dev/drive.cjs`로 실제 상태를 띄워 1280×800 스크린샷으로 본다.
- `src-tauri`를 건드리면 `npx tauri build --no-bundle`. Linux에서는 WebKitGTK 개발 패키지가 필요하다.
