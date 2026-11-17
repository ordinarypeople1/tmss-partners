# 에이전트와 ECS

v1 시뮬은 Rust 함수다. 아래는 엔티티가 그 경계를 넘을 때의 후보와, 규칙을 실험할 때의 도구다. [ADR 0003](../adr/0003-simulation.md).

## bitECS

- 저장소: <https://github.com/NateTheGreatt/bitECS>
- 라이선스: Mozilla Public License 2.0. 라이브러리 파일을 고치면 그 파일의 공개 의무가 생긴다. 더 큰 게임 전체를 MPL로 만들라는 뜻은 아니다. 도입 전에 2.0의 파일 단위 조건을 다시 읽는다.
- 이유: 예전 TypeScript 런타임을 가정한 ECS 후보. 시뮬이 Rust인 지금은 첫 후보가 아니다. 경계를 다시 열 때 비교하려고 남겨 둔다.

## flecs

- 주소: <https://www.flecs.dev/>
- 저장소: <https://github.com/SanderMertens/flecs>
- 라이선스: MIT.
- 이유: C/C++ ECS의 참고 구현. 구조를 볼 때 읽고, 게임에 링크하지 않는다.

## Bevy ECS

- 저장소: <https://github.com/bevyengine/bevy>
- 라이선스: MIT 또는 Apache-2.0.
- 이유: 엔진을 바꾸지 않아도, 시스템 순서와 컴포넌트 경계를 읽을 가치가 있다. 엔진으로서의 평가는 [엔진](engines.md)에 있다.

## Mesa

- 저장소: <https://github.com/mesa/mesa> (`projectmesa/mesa`가 여기로 이어졌다)
- 문서: <https://mesa.readthedocs.io/stable/>
- 라이선스: 이 점검에서 LICENSE 파일 본문은 열지 않았다. 도입하거나 스크립트를 재배포하기 전에 그 파일을 읽는다.
- 이유: 파이프라인과 같은 Python으로 매도자·대주 규칙을 실험할 때. 게임 빌드에 넣지 않는다.

## NetLogo

- 주소: <https://www.netlogo.org/index> (`ccl.northwestern.edu/netlogo`가 여기로 이어졌다)
- 라이선스: 이 점검에서 라이선스 본문은 확인하지 못했다.
- 이유: 에이전트 모형을 빠르게 스케치하는 연구 도구. 런타임이 아니다.
