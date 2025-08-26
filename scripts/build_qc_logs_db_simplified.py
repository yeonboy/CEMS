#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QC_logs_fixed.csv 파일을 지침에 따라 간소화하여 db/QC_logs.json 파일로 구축하는 스크립트

지침:
- 3열(일련번호)로 장비 매칭
- 5열(정도검사일) → 최근 정도검사일
- 6열(유효기간) → 다음 정도검사 예정일
- 기타 데이터는 활용하지 않음
"""

import pandas as pd
import json
import os
from datetime import datetime

def build_qc_logs_db_simplified():
    # 파일 경로
    input_file = os.path.join(os.path.dirname(__file__), "..", "청명장비 엑셀", "QC_logs_fixed.csv")
    output_file = os.path.join(os.path.dirname(__file__), "..", "db", "QC_logs.json")
    
    try:
        # CSV 파일 읽기
        print("📖 QC_logs_fixed.csv 파일 읽는 중...")
        df = pd.read_csv(input_file, encoding='utf-8')
        
        print(f"✅ 파일 읽기 성공!")
        print(f"데이터 행 수: {len(df)}")
        
        # 지침에 따른 필드만 추출
        qc_logs = []
        
        for index, row in df.iterrows():
            # 빈 행 건너뛰기
            if pd.isna(row['항목']) or str(row['항목']).strip() == '':
                continue
                
            # 지침에 따른 필드만 추출
            qc_log = {
                'id': f"qc_{index + 1:04d}",
                'serial_number': row['일련번호'] if pd.notna(row['일련번호']) else None,
                'latest_calibration_date': row['정도검사일'] if pd.notna(row['정도검사일']) else None,
                'next_calibration_date': row['유효기간'] if pd.notna(row['유효기간']) else None,
                'created_at': datetime.now().isoformat()
            }
            
            # 날짜 형식 정리 (YYYY.MM.DD → YYYY-MM-DD)
            if qc_log['latest_calibration_date']:
                try:
                    if '.' in str(qc_log['latest_calibration_date']):
                        date_parts = str(qc_log['latest_calibration_date']).split('.')
                        if len(date_parts) == 3:
                            qc_log['latest_calibration_date'] = f"{date_parts[0]}-{date_parts[1].zfill(2)}-{date_parts[2].zfill(2)}"
                except:
                    pass
            
            if qc_log['next_calibration_date']:
                try:
                    if '.' in str(qc_log['next_calibration_date']):
                        date_parts = str(qc_log['next_calibration_date']).split('.')
                        if len(date_parts) == 3:
                            qc_log['next_calibration_date'] = f"{date_parts[0]}-{date_parts[1].zfill(2)}-{date_parts[2].zfill(2)}"
                except:
                    pass
            
            # 일련번호가 있는 경우만 추가
            if qc_log['serial_number']:
                qc_logs.append(qc_log)
        
        print(f"✅ 데이터 변환 완료: {len(qc_logs)}개 레코드")
        
        # JSON 파일로 저장
        print("💾 JSON 파일 저장 중...")
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(qc_logs, f, ensure_ascii=False, indent=2)
        
        print(f"✅ QC_logs.json 파일 생성 완료: {output_file}")
        
        # 샘플 데이터 출력
        print("\n📋 샘플 데이터:")
        if qc_logs:
            sample = qc_logs[0]
            for key, value in sample.items():
                print(f"  {key}: {value}")
        
        # 통계 정보
        print(f"\n📊 통계 정보:")
        print(f"  - 총 레코드 수: {len(qc_logs)}")
        
        # 일련번호별 최신 정도검사 정보 확인
        serial_calibration = {}
        for log in qc_logs:
            serial = log['serial_number']
            if serial not in serial_calibration:
                serial_calibration[serial] = []
            serial_calibration[serial].append(log)
        
        print(f"  - 고유 일련번호 수: {len(serial_calibration)}")
        
        # 중복 일련번호가 있는 경우 확인
        duplicates = {serial: logs for serial, logs in serial_calibration.items() if len(logs) > 1}
        if duplicates:
            print(f"  - 중복 일련번호 수: {len(duplicates)}")
            for serial, logs in list(duplicates.items())[:3]:  # 처음 3개만 출력
                print(f"    {serial}: {len(logs)}개 레코드")
        
        return True
        
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    build_qc_logs_db_simplified()
