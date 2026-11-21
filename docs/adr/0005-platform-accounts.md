# ADR 0005 — 플랫폼 계정과 저장

- 상태: 수용. 순서는 [ADR 0006](0006-steam-first.md)의 Steam 먼저를 따른다
- 날짜: 2026-11-21

## 결정

자체 계정과 서버를 두지 않는다. 각 스토어의 계정을 그대로 쓴다. 게임은 싱글 플레이, 오프라인이다([ADR 0001](0001-tech-stack.md)). 로그인이 없어도 게임은 처음부터 끝까지 돈다.

| 채널 | 정체성 | 클라우드 저장 | 업적 | 붙이는 곳 |
| --- | --- | --- | --- | --- |
| Steam (Windows, macOS) | Steam 클라이언트가 이미 로그인. 게임 안 로그인 화면 없음 | Steam Cloud. 우선 Auto-Cloud로 저장 파일 폴더 지정 | Steamworks | Tauri 데스크톱, Rust `steamworks` 크레이트를 `src-tauri` 커맨드로 |
| Google Play (Android) | Play Games Services v2. 시작 시 자동 로그인, 실패해도 진행 | Play Games Saved Games(스냅샷) | Play Games | Tauri 모바일 Kotlin 플러그인 |
| App Store (iOS, iPadOS) | Game Center. 시작 시 자동 인증, 거절해도 진행 | iCloud(GameKit 저장 게임 또는 iCloud Documents) | Game Center | Tauri 모바일 Swift 플러그인 |
| 웹 개발 빌드 | 없음 | 없음. IndexedDB 한 칸 | 없음 | 지금 코드 |

## 이유

- 세 스토어 모두 플랫폼 계정 자동 로그인이 기본 동선이다. 따로 가입하는 화면은 이탈만 늘린다.
- 자체 계정을 두는 순간 서버, 개인정보 처리방침, 계정 삭제 기능(App Store와 Google Play 둘 다 요구), 소셜 로그인을 넣으면 Sign in with Apple 의무(App Store 심사 지침 4.8)가 따라온다. 싱글 플레이 게임이 질 짐이 아니다.
- 저장은 이미 문자열 한 덩어리(`GameSession.save()`)다. 플랫폼 클라우드는 파일이나 바이트 덩어리를 받으므로 변환이 필요 없다.

## 구조

화면은 플랫폼을 모른다. `src/ui/saveStore.ts`의 `readSave`와 `writeSave`가 지금의 경계다. 패키징할 때 이 경계를 `Platform` 인터페이스로 넓힌다.

```ts
interface Platform {
  readSave(): Promise<string | null>;
  writeSave(save: string): Promise<void>;
  /** 플랫폼 이름(Steam 닉네임, Game Center 별명). 없으면 null. */
  player(): Promise<string | null>;
  unlock(achievement: string): void;
  /** 데스크톱만. 타이틀 화면의 "종료" 버튼이 이것이 있을 때만 보인다. */
  quit?(): void;
}
```

빌드마다 구현 하나를 고른다. 웹은 IndexedDB, Tauri는 앱 데이터 폴더의 파일과 각 SDK 커맨드다.

## 충돌

기기 둘에서 같은 계정으로 플레이하면 클라우드 저장이 엇갈린다. 저장 머리에 `month`(게임 진행 개월)와 저장 시각을 둔다. 타이틀 화면이 로컬과 클라우드가 다르면 둘을 나란히 보여 주고 플레이어가 고른다. 자동으로 덮어쓰지 않는다.

## 미룬 것

- 스토어 간 진행 공유(Steam에서 하던 게임을 iPhone에서 이어 하기). 자체 백엔드와 계정 연결이 필요하다. 출시 후 수요를 보고 연다.
- 저장 크기. 지금 약 6MB다. 클라우드 한도에는 들어가지만, gzip으로 줄이면 모바일 동기화가 빨라진다.
- 결제. 유료 앱(premium)이면 로그인과 무관하다. 인앱 결제를 넣으면 각 스토어 결제를 따로 붙이고 이 ADR을 다시 연다.

## 순서

1. 지금: 타이틀 화면, IndexedDB 저장 한 칸. 웹과 Tauri 웹뷰 모두 동작.
2. Steam 빌드: `src-tauri`에 저장 파일 경로, Auto-Cloud 설정, Steamworks 초기화와 업적. 종료 버튼.
3. Android: Play Games v2 로그인과 Saved Games.
4. iOS: Game Center 인증과 iCloud 저장.
5. 충돌 선택 화면.
