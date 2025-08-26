#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
logs_fixed.csv의 데이터를 분석하여 equipment_data.json과 equipment_db.json의 
장비 상태를 실제 이동 현황에 맞게 업데이트하는 스크립트
"""

import pandas as pd
import json
import os
from datetime import datetime

def update_equipment_status():
    # 파일 경로
    logs_file = os.path.join(os.path.dirname(__file__), "..", "청명장비 엑셀", "logs_fixed.csv")
    equipment_data_file = os.path.join(os.path.dirname(__file__), "..", "db", "equipment_data.json")
    equipment_db_file = os.path.join(os.path.dirname(__file__), "..", "db", "equipment_db.json")
    
    try:
        # logs_fixed.csv 읽기 (header=1 사용)
        print("📖 logs_fixed.csv 파일 읽는 중...")
        logs_df = pd.read_csv(logs_file, encoding='utf-8', header=1)
        
        # 컬럼명에서 \t 제거
        logs_df.columns = [col.replace('\t', '') for col in logs_df.columns]
        
        # equipment_data.json 읽기
        print("📖 equipment_data.json 파일 읽는 중...")
        with open(equipment_data_file, 'r', encoding='utf-8') as f:
            equipment_data = json.load(f)
        
        # equipment_db.json 읽기
        print("📖 equipment_db.json 파일 읽는 중...")
        with open(equipment_db_file, 'r', encoding='utf-8') as f:
            equipment_db = json.load(f)
        
        print(f"✅ 로그 데이터: {len(logs_df)}행")
        print(f"✅ 장비 데이터: {len(equipment_data)}개")
        print(f"✅ 장비 DB: {len(equipment_db)}개")
        
        # 컬럼명 확인
        print(f"\n📋 logs_fixed.csv 컬럼명: {list(logs_df.columns)}")
        
        # 시리얼번호별 최신 이동 정보 추출
        print("\n🔍 시리얼번호별 최신 이동 정보 분석 중...")
        latest_movements = {}
        
        for _, row in logs_df.iterrows():
            # 시리얼번호는 '규격' 컬럼에 있음
            serial = str(row['규격']).strip()
            if pd.isna(serial) or serial == 'nan' or serial == '':
                continue
                
            # 날짜는 '일자-No.' 컬럼에 있음
            date_str = str(row['일자-No.']).strip()
            if pd.isna(date_str) or date_str == 'nan' or date_str == '':
                continue
            
            # 날짜 파싱 (2024/07/18 -1 형식)
            try:
                if '-' in date_str and '/' in date_str:
                    date_part = date_str.split('-')[0]
                    if len(date_part.split('/')) == 3:
                        year, month, day = date_part.split('/')
                        date_obj = datetime(int(year), int(month), int(day))
                        
                        if serial not in latest_movements or date_obj > latest_movements[serial]['date']:
                            latest_movements[serial] = {
                                'date': date_obj,
                                '출고처': str(row['출고창고명']).strip() if pd.notna(row['출고창고명']) else '',
                                '입고처': str(row['입고창고명']).strip() if pd.notna(row['입고창고명']) else '',
                                '품목명': str(row['품목명']).strip() if pd.notna(row['품목명']) else '',
                                '수량': str(row['수량']).strip() if pd.notna(row['수량']) else '',
                                '장비상태': str(row['장비상태']).strip() if pd.notna(row['장비상태']) else '',
                                '비고': str(row['비고']).strip() if pd.notna(row['비고']) else ''
                            }
            except Exception as e:
                print(f"⚠️ 날짜 파싱 오류 (시리얼: {serial}, 날짜: {date_str}): {e}")
                continue
        
        print(f"✅ 분석된 시리얼번호: {len(latest_movements)}개")
        
        # equipment_data.json 업데이트
        print("\n🔄 equipment_data.json 업데이트 중...")
        updated_count = 0
        
        for item in equipment_data:
            serial = str(item.get('시리얼번호', '')).strip()
            if serial in latest_movements:
                movement = latest_movements[serial]
                
                # 현재 위치 업데이트
                if movement['입고처'] and movement['입고처'] != 'nan':
                    item['출고처'] = movement['출고처'] if movement['출고처'] and movement['출고처'] != 'nan' else '청명'
                    item['입고처'] = movement['입고처']
                    item['날짜'] = movement['date'].strftime('%Y/%m/%d')
                    
                    # 상태 업데이트
                    if movement['입고처'] == '현장':
                        item['상태'] = '가동중'
                    elif movement['입고처'] == '업체':
                        item['상태'] = '수리중'
                    else:
                        item['상태'] = '대기중'
                    
                    updated_count += 1
        
        print(f"✅ equipment_data.json 업데이트 완료: {updated_count}개")
        
        # equipment_db.json 업데이트
        print("\n🔄 equipment_db.json 업데이트 중...")
        updated_db_count = 0
        
        for item in equipment_db:
            serial = str(item.get('serial', '')).strip()
            if serial in latest_movements:
                movement = latest_movements[serial]
                
                # 현재 위치 업데이트
                if movement['입고처'] and movement['입고처'] != 'nan':
                    if movement['입고처'] == '현장':
                        item['currentLocation'] = '현장'
                        item['status'] = '가동 중'
                    elif movement['입고처'] == '업체':
                        item['currentLocation'] = '수리업체'
                        item['status'] = '수리 중'
                    else:
                        item['currentLocation'] = '본사 창고'
                        item['status'] = '대기 중'
                    
                    # 마지막 이동 정보 업데이트
                    item['lastMovement'] = f"{movement['date'].strftime('%Y/%m/%d')} - {movement['출고처']} → {movement['입고처']}"
                    
                    updated_db_count += 1
        
        print(f"✅ equipment_db.json 업데이트 완료: {updated_db_count}개")
        
        # 파일 저장
        print("\n💾 파일 저장 중...")
        
        # equipment_data.json 저장
        with open(equipment_data_file, 'w', encoding='utf-8') as f:
            json.dump(equipment_data, f, ensure_ascii=False, indent=2)
        
        # equipment_db.json 저장
        with open(equipment_db_file, 'w', encoding='utf-8') as f:
            json.dump(equipment_db, f, ensure_ascii=False, indent=2)
        
        print("✅ 모든 파일 저장 완료!")
        
        # 업데이트 결과 요약
        print(f"\n📊 업데이트 결과 요약:")
        print(f"   - 총 분석된 시리얼번호: {len(latest_movements)}개")
        print(f"   - equipment_data.json 업데이트: {updated_count}개")
        print(f"   - equipment_db.json 업데이트: {updated_db_count}개")
        
        # 위치별 장비 수 통계
        location_stats = {}
        for movement in latest_movements.values():
            location = movement['입고처']
            if location and location != 'nan':
                location_stats[location] = location_stats.get(location, 0) + 1
        
        print(f"\n📍 현재 위치별 장비 수:")
        for location, count in location_stats.items():
            print(f"   - {location}: {count}개")
        
        return True
        
    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    update_equipment_status()
