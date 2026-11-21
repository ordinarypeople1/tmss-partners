# ADR 0006 — Steam 먼저

- 상태: 수용
- 날짜: 2026-11-21

## 결정

1차 출시는 Steam이다. Windows가 기준 플랫폼이고, macOS와 Steam Deck이 뒤를 잇는다. Google Play와 App Store는 Steam 출시 뒤에 연다.

모바일을 버리지 않는다. 폰 레이아웃과 터치 조작은 지금처럼 유지하고 깨지지 않게만 지킨다. 다만 기능의 완료 기준, 성능 예산, 출시 체크리스트는 데스크톱이 정한다.

## 기준

| 항목 | 기준 |
| --- | --- |
| 1순위 OS | Windows 10·11, 64비트. Tauri 웹뷰는 WebView2 |
| 2순위 | macOS(WKWebView), Steam Deck |
| 입력 | 마우스와 키보드가 1급. 모든 주요 동작에 단축키. 컨트롤러는 Deck 단계에서 |
| 해상도 | 1280×800(Deck)부터 2560×1440까지. 1280×800에서 글자가 읽혀야 한다 |
| 창 | 크기 조절, 전체 화면 전환(F11), 창 위치와 크기 기억 |
| 저장 | 앱 데이터 폴더의 파일. Steam Auto-Cloud가 그 폴더를 동기화 |
| 계정 | Steam 계정 그대로. 게임 안 로그인 없음([ADR 0005](0005-platform-accounts.md)) |
| 업적 | 게임 안 업적을 Steamworks 업적과 1:1로 잇는다 |
| 타이틀 화면 | 계속하기, 새 게임, 설정, 종료 |

## 성능 예산

[ADR 0001](0001-tech-stack.md)의 표는 그대로 두고, 측정 기기를 바꾼다. 첫 기준은 저사양 Android가 아니라 Steam의 저사양 데스크톱이다. 메모리 8GB, 내장 그래픽, 4코어 노트북 CPU. 저사양 Android 측정은 모바일 출시 전에 한다.

## 위험

확인 전에는 되는 것으로 쓰지 않는다.

- **Steam 오버레이.** 오버레이는 게임의 그래픽 출력에 끼어드는 방식이다. 웹뷰 창(WebView2)에서는 뜨지 않을 수 있다. 첫 Windows 빌드에서 확인한다. 안 되면 오버레이 없이 출시하거나 껍질을 다시 본다.
- **Steam Deck.** 네이티브 Linux 빌드는 WebKitGTK 위에서 돈다. MapLibre의 WebGL 성능이 Windows보다 낮을 수 있다. Proton 위의 Windows 빌드는 WebView2 설치가 걸린다. 둘 다 Deck 실기에서 잰다.
- **툴체인.** Rust stable과 Tauri 2.12로 올렸다. Linux 릴리스 빌드에서 타이틀, 새 게임, 지도가 돈다. Windows 실행 파일은 CI 첫 실행에서 확인한다.
- **빌드 머신.** 이 개발 컨테이너에는 WebKit도 Windows도 없다. Windows 빌드는 CI(GitHub Actions의 Windows 러너)나 실제 Windows 기기에서 한다.

## 순서

1. 데스크톱 화면 다듬기: 단축키, 1280×800 점검, 창 상태 기억, 타이틀의 종료 버튼.
2. Windows 빌드: `src-tauri`를 CI에서 링크하고 실행 파일을 만든다. 저장을 앱 데이터 폴더 파일로.
3. Steamworks: 초기화, 업적, Auto-Cloud. 오버레이 확인.
4. 스토어 페이지와 위시리스트. 데모와 Steam Next Fest 일정은 그 뒤에 정한다.
5. macOS, Steam Deck.
6. 모바일([ADR 0005](0005-platform-accounts.md)의 Android, iOS 단계).
