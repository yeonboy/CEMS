import json
import os
from datetime import datetime

def load_json_file(file_path):
    """JSON 파일을 로드합니다."""
    try:
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return None
    except Exception as e:
        print(f"파일 로드 오류 {file_path}: {e}")
        return None

def create_dashboard_data():
    """통합대시보드 데이터를 생성합니다."""
    
    print("통합대시보드 데이터 생성 시작...")
    
    # DB 파일들 로드
    equipment_data = load_json_file('db/equipment_db_clean.json')
    repairs_data = load_json_file('db/repairs_db_clean.json')
    movements_data = load_json_file('db/movements_db.json')
    
    if not equipment_data:
        print("장비 데이터를 로드할 수 없습니다.")
        return
    
    # 장비 요약 정보
    equipment_summary = {
        "total_equipment": len(equipment_data),
        "by_measurement_item": {},
        "by_status": {},
        "by_location": {}
    }
    
    # 측정항목별, 상태별, 위치별 통계
    for equipment in equipment_data:
        # 측정항목별
        item = equipment.get('measurement_item', '알 수 없음')
        equipment_summary['by_measurement_item'][item] = equipment_summary['by_measurement_item'].get(item, 0) + 1
        
        # 상태별
        status = equipment.get('status', '알 수 없음')
        equipment_summary['by_status'][status] = equipment_summary['by_status'].get(status, 0) + 1
        
        # 위치별
        location = equipment.get('currentLocation', '알 수 없음')
        equipment_summary['by_location'][location] = equipment_summary['by_location'].get(location, 0) + 1
    
    # 수리 요약 정보
    repairs_summary = {
        "total_repairs": 0,
        "equipment_match_rate": 0,
        "by_company": {},
        "by_repair_type": {},
        "cost_summary": {
            "total_cost": 0,
            "average_cost": 0,
            "min_cost": 0,
            "max_cost": 0
        }
    }
    
    if repairs_data:
        repairs_summary["total_repairs"] = len(repairs_data)
        
        # 수리업체별 통계
        for repair in repairs_data:
            company = repair.get('repair_company', '알 수 없음')
            repairs_summary['by_company'][company] = repairs_summary['by_company'].get(company, 0) + 1
            
            # 수리구분별 통계
            repair_type = repair.get('repair_type', '알 수 없음')
            repairs_summary['by_repair_type'][repair_type] = repairs_summary['by_repair_type'].get(repair_type, 0) + 1
            
            # 비용 통계
            try:
                cost = int(repair.get('cost', '0').replace(',', ''))
                repairs_summary['cost_summary']['total_cost'] += cost
                if cost > 0:
                    if repairs_summary['cost_summary']['min_cost'] == 0 or cost < repairs_summary['cost_summary']['min_cost']:
                        repairs_summary['cost_summary']['min_cost'] = cost
                    if cost > repairs_summary['cost_summary']['max_cost']:
                        repairs_summary['cost_summary']['max_cost'] = cost
            except:
                pass
        
        # 평균 비용 계산
        if repairs_summary["total_repairs"] > 0:
            repairs_summary['cost_summary']['average_cost'] = repairs_summary['cost_summary']['total_cost'] // repairs_summary["total_repairs"]
        
        # 장비 매칭 성공률
        matched_count = sum(1 for repair in repairs_data if repair.get('measurement_item') != "알 수 없음")
        repairs_summary["equipment_match_rate"] = round((matched_count / repairs_summary["total_repairs"]) * 100, 1)
    
    # 이동 요약 정보
    movements_summary = {
        "total_movements": 0,
        "recent_movements": []
    }
    
    if movements_data and len(movements_data) > 1:  # 빈 배열이 아닌 경우
        movements_summary["total_movements"] = len(movements_data)
        movements_summary["recent_movements"] = movements_data[-5:] if len(movements_data) > 5 else movements_data
    
    # 상위 장비 정보
    top_equipment = {
        "most_repaired": [],
        "by_measurement_item": {}
    }
    
    if repairs_data:
        # 일련번호별 수리 횟수 계산
        serial_counts = {}
        for repair in repairs_data:
            serial = repair.get('serial', '')
            if serial:
                serial_counts[serial] = serial_counts.get(serial, 0) + 1
        
        # 수리 횟수 상위 10개
        sorted_serials = sorted(serial_counts.items(), key=lambda x: x[1], reverse=True)
        top_equipment["most_repaired"] = [
            {"serial": serial, "repair_count": count} 
            for serial, count in sorted_serials[:10]
        ]
    
    # 측정항목별 대표 장비
    for item, count in equipment_summary['by_measurement_item'].items():
        examples = []
        for equipment in equipment_data:
            if equipment.get('measurement_item') == item and len(examples) < 3:
                examples.append(equipment.get('serial', ''))
        
        top_equipment["by_measurement_item"][item] = {
            "count": count,
            "examples": examples
        }
    
    # 최근 활동 정보
    recent_activity = {
        "last_repairs": [],
        "last_movements": [],
        "system_status": "정상"
    }
    
    if repairs_data:
        # 최근 수리 기록 (최대 5개)
        recent_activity["last_repairs"] = repairs_data[-5:] if len(repairs_data) > 5 else repairs_data
    
    if movements_data and len(movements_data) > 1:
        recent_activity["last_movements"] = movements_data[-5:] if len(movements_data) > 5 else movements_data
    
    # 통합 대시보드 데이터 생성
    dashboard_data = {
        "dashboard_info": {
            "title": "청명장비 통합대시보드",
            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "data_sources": [
                "equipment_db_clean.json",
                "repairs_db_clean.json", 
                "movements_db.json"
            ]
        },
        "equipment_summary": equipment_summary,
        "repairs_summary": repairs_summary,
        "movements_summary": movements_summary,
        "top_equipment": top_equipment,
        "recent_activity": recent_activity
    }
    
    # JSON 파일로 저장
    output_file = 'db/dashboard_data.json'
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(dashboard_data, f, ensure_ascii=False, indent=2)
        print(f"\n통합대시보드 데이터가 {output_file}에 저장되었습니다.")
        
        # 요약 정보 출력
        print("\n=== 통합대시보드 요약 ===")
        print(f"총 장비: {equipment_summary['total_equipment']}대")
        print(f"총 수리 기록: {repairs_summary['total_repairs']}건")
        print(f"장비 매칭 성공률: {repairs_summary['equipment_match_rate']}%")
        print(f"총 수리 비용: {repairs_summary['cost_summary']['total_cost']:,}원")
        
        print(f"\n측정항목별 장비 수:")
        for item, count in sorted(equipment_summary['by_measurement_item'].items()):
            print(f"  {item}: {count}대")
        
        print(f"\n수리업체별 수리 건수:")
        for company, count in sorted(repairs_summary['by_company'].items()):
            print(f"  {company}: {count}건")
        
        print(f"\n수리 횟수 상위 장비:")
        for i, item in enumerate(top_equipment['most_repaired'][:5], 1):
            print(f"  {i}. {item['serial']}: {item['repair_count']}회")
        
    except Exception as e:
        print(f"파일 저장 오류: {e}")

if __name__ == "__main__":
    create_dashboard_data()
