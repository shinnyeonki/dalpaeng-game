# 📘 이중 확률 기반 달팽이 경주 설계서 (v2.0)

## 1. 필수 환경 변수 및 상수 (Environment Variables)

### 1-1. 월드 설정 (World Settings)
*   **`GOAL_DISTANCE`**: `200.0` (목표 거리, 단위: m)
*   **`DT`**: `0.016` (Delta Time, 60 FPS 기준 프레임당 시간)

### 1-2. 기본 속도 설정 (Base Speed Config)
*   **`BASE_SPEED_MEAN`**: `6.0` (평균 기본 속도)
*   **`SPEED_VARIANCE`**: `4.0` (속도 편차 범위)
    *   **의미:** 달팽이의 기본 컨디션은 `2.0` ~ `10.0` 사이에서 결정됩니다.
*   **속도 제어 변수**:
    *   `CONDITION_INTERVAL`: `1.5`초 (컨디션이 변화하는 주기)
    *   `CONDITION_SMOOTHING`: `0.03` (급격한 속도 변화를 방지하는 보간 계수)

### 1-3. 시소 환경 변수 (Seesaw Config)
*   **`seesawValue`**: `-1.0` (왼쪽 높음) ~ `+1.0` (오른쪽 높음)
    *   `seesawTarget`: `-1.0 ~ 1.0` 사이의 랜덤한 목표값.
    *   변화 방식: 매 프레임 `0.04`의 속도로 `seesawValue`가 `seesawTarget`을 향해 부드럽게 추적.

### 1-4. 캐릭터 설정 (Character Stats)
*   **`A타입 (미끌미끌 달팽이)`**: 민감도 `4.0` (환경 영향 높음)
*   **`B타입 (빤딱빤딱 달팽이)`**: 민감도 `1.5` (환경 영향 낮음)

---

## 2. 시스템 핵심 로직 (Core Logic)

### 2-1. 이동 처리 알고리즘 (매 프레임 실행)

```javascript
// 1. 컨디션(목표 기본 속도) 업데이트 (일정 주기마다)
if (conditionTimer <= 0) {
    targetBaseSpeed = BASE_SPEED_MEAN + (Math.random() * 2 - 1) * SPEED_VARIANCE;
    conditionTimer = CONDITION_INTERVAL * (0.5 + Math.random());
}

// 2. 현재 기본 속도를 목표 속도로 부드럽게 접근
currentBaseSpeed += (targetBaseSpeed - currentBaseSpeed) * CONDITION_SMOOTHING;

// 3. 최종 속도 계산 (환경 영향 반영)
finalVelocity = currentBaseSpeed + (seesawValue * sensitivity);

// 4. 위치 이동 및 후진 방지
position += finalVelocity * DT;
if (position < 0) position = 0;
```

---

## 3. 캐릭터별 밸런스 (Character Balance)

### 🐌 A 타입: "미끌미끌 달팽이" (High Risk, High Return)
*   **속도 공식**: `(2.0 ~ 10.0) + (seesawValue * 4.0)`
*   **최악 (오르막 -1.0)**: `-2.0 ~ 6.0` (역주행 가능성 존재, 매우 느려짐)
*   **최고 (내리막 +1.0)**: `6.0 ~ 14.0` (폭발적인 가속)

### 🐌 B 타입: "빤딱빤딱 달팽이" (Stability)
*   **속도 공식**: `(2.0 ~ 10.0) + (seesawValue * 1.5)`
*   **최악 (오르막 -1.0)**: `0.5 ~ 8.5` (어떤 상황에서도 **전진 유지**)
*   **최고 (내리막 +1.0)**: `3.5 ~ 11.5` (안정적인 속도 향상)

---

## 4. 승패 결정 및 시각적 요소

1.  **도착 판정**: 달팽이의 머리 위치 보정값(+5m)을 포함하여 `position + 5 >= GOAL_DISTANCE` 일 때 승리합니다.
2.  **후진 페널티**: 출발선(`0`) 미만으로 떨어지는 에너지는 증발하므로, 오르막에서 뒤로 밀리는 `A타입`이 장기적으로 불리할 확률이 높습니다.
3.  **애니메이션**: 속도와 위치 기반의 사인파를 사용하여 앞뒤로 수축/팽창(Squash and Stretch)하며 기어가는 효과를 연출합니다.

---

## 5. 특수 이벤트: 천사의 가호 (Angel's Grace)

경주 중반부, 뒤처진 달팽이들에게 역전의 기회를 제공하는 보정 시스템입니다.

### 5-1. 발동 조건 (Trigger)
*   **시점**: 선두 달팽이가 목표 거리의 **30% 지점**(`60m`)을 통과할 때 단 1회 확률적으로 체크.
*   **발동 확률**: 조건 충족 시 약 30%의 확률로 발동.

### 5-2. 대상 선정 (Selection)
1.  **후보군**: 현재 위치(`position`) 기준 하위 **20%**의 그룹을 추출.
2.  **최종 선정**: 후보군 내의 각 달팽이마다 **30% 확률**로 개별 가호 부여.

### 5-3. 물리 및 시각 효과 (Effects)
*   **가속 배수**: 해당 달팽이의 최종 속도(`finalVelocity`)에 **2.5배** 적용.
*   **지속 시간**: **4.0초** 동안 유지.
*   **시각 연출**:
    *   개별 천사 메쉬가 300m 상공에서 0.3초 만에 급강하하여 달팽이 머리 위(45m)에 도착.
    *   천사가 하강을 시작한 후 **0.2초 뒤**부터 실제 물리 가속 시작 (시각적 일치감 확보).
    *   지속 시간이 종료되면 천사는 다시 하늘로 빠르게 소멸.
