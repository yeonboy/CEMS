import json

def clean_equipment_db():
    """헤더를 제거하고 정리된 장비 데이터베이스를 생성합니다."""
    
    # 기존 파일 로드
    try:
        with open('db/equipment_db_fixed.json', 'r', encoding='utf-8') as f:
            equipment_data = json.load(f)
        print(f"기존 장비 데이터 로드: {len(equipment_data)}개")
    except Exception as e:
        print(f"파일 로드 오류: {e}")
        return
    
    # 헤더 제거 (첫 번째 항목)
    if equipment_data and equipment_data[0]['serial'] == '일련번호':
        equipment_data = equipment_data[1:]
        print("헤더 제거 완료")
    
    # 유효한 장비만 필터링
    valid_equipment = []
    for equipment in equipment_data:
        if equipment['serial'] and equipment['serial'] != '일련번호':
            valid_equipment.append(equipment)
    
    print(f"유효한 장비 데이터: {len(valid_equipment)}개")
    
    # JSON 파일로 저장
    output_file = 'db/equipment_db_clean.json'
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(valid_equipment, f, ensure_ascii=False, indent=2)
        print(f"\n정리된 장비 데이터베이스가 {output_file}에 저장되었습니다.")
        
        # 일련번호 목록 출력 (검증용)
        serials = [eq['serial'] for eq in valid_equipment]
        print(f"\n일련번호 목록 (처음 20개): {serials[:20]}")
        print(f"일련번호 목록 (마지막 20개): {serials[-20:]}")
        
        # 특정 일련번호 검색
        target_serials = ['1316', '851', '1793']
        for target in target_serials:
            if target in serials:
                print(f"✓ {target} 발견됨")
            else:
                print(f"✗ {target} 누락됨")
                
        # 측정항목별 통계
        measurement_items = {}
        for eq in valid_equipment:
            item = eq['measurement_item']
            measurement_items[item] = measurement_items.get(item, 0) + 1
        
        print("\n측정항목별 통계:")
        for item, count in sorted(measurement_items.items()):
            print(f"  {item}: {count}대")
                
    except Exception as e:
        print(f"파일 저장 오류: {e}")

if __name__ == "__main__":
    clean_equipment_db()
