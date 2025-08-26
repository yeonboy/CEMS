

import pandas as pd
import os

# --- Configuration ---
desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
serials_file = os.path.join(desktop_path, "serials.csv")
logs_file = os.path.join(desktop_path, "logs.csv")
output_file = os.path.join(desktop_path, "장비재고현황.xlsx")

# --- Main Script ---
try:
    # 1. Load serial numbers (col C) and categories (col B), skipping the header
    print("1. 'serials.csv' 파일에서 장비 일련번호와 품목계열을 읽어옵니다...")
    serials_df = pd.read_csv(serials_file, header=None, usecols=[1, 2], names=['category', 'serial'], dtype=str, encoding='cp949', skiprows=1)
    serials_df['serial'] = serials_df['serial'].str.strip()
    serials_df.dropna(subset=['serial'], inplace=True)
    serial_list = serials_df['serial'].unique().tolist()
    print(f"  - 총 {len(serial_list)}개의 고유한 장비 일련번호를 찾았습니다.")

    # Create a mapping from serial to category for later use
    category_map = pd.Series(serials_df.category.values, index=serials_df.serial).to_dict()

    # 2. Load and clean the movement logs
    print("\n2. 'logs.csv' 파일에서 장비 이동 기록을 읽고 정리합니다...")
    log_column_names = ['date_raw', 'from_loc', 'to_loc', 'serial', 'quantity']
    logs_df = pd.read_csv(logs_file, header=None, names=log_column_names, dtype={'serial': str}, encoding='cp949', skiprows=1)

    # Clean data
    logs_df['date'] = pd.to_datetime(logs_df['date_raw'].astype(str).str.split('-').str[0].str.strip(), format='%Y/%m/%d', errors='coerce')
    logs_df['serial'] = logs_df['serial'].str.strip()
    logs_df.dropna(subset=['date', 'serial'], inplace=True)

    # Filter logs to only include the serials we are interested in
    logs_df = logs_df[logs_df['serial'].isin(serial_list)]
    logs_df.sort_values(by=['serial', 'date'], inplace=True)
    print(f"  - 분석할 총 {len(logs_df)}개의 유효한 이동 기록을 찾았습니다.")

    # 3. Create the inventory DataFrame
    print("\n3. 재고 현황표를 생성합니다 (2024-07-16 ~ 2025-07-16)...")
    date_range = pd.date_range(start='2024-07-16', end='2025-07-16')
    inventory_df = pd.DataFrame(1, index=serial_list, columns=date_range)
    inventory_df.index.name = '일련번호'
    inventory_df.columns = inventory_df.columns.strftime('%Y-%m-%d')

    # 4. Process logs to update inventory status
    print("\n4. 이동 기록을 바탕으로 일별 재고를 계산합니다...")
    for i, serial in enumerate(serial_list):
        serial_logs = logs_df[logs_df['serial'] == serial].copy()
        serial_logs['from_loc'] = serial_logs['from_loc'].str.strip()
        serial_logs['to_loc'] = serial_logs['to_loc'].str.strip()

        departures = serial_logs[serial_logs['from_loc'].str.contains('청명', na=False)]
        
        for _, departure_log in departures.iterrows():
            departure_date = departure_log['date']
            returns = serial_logs[
                (serial_logs['date'] > departure_date) & 
                (serial_logs['to_loc'].str.contains('청명', na=False))
            ]
            
            if not returns.empty:
                return_date = returns.iloc[0]['date']
            else:
                return_date = date_range[-1]

            away_dates = pd.date_range(start=departure_date, end=return_date)
            valid_away_dates = inventory_df.columns.intersection(away_dates.strftime('%Y-%m-%d'))
            
            if not valid_away_dates.empty:
                inventory_df.loc[serial, valid_away_dates] = 0
        
        if (i + 1) % 30 == 0:
            print(f"  - 처리 진행: {i+1}/{len(serial_list)} 장비 완료...")

    print("  - 재고 계산이 완료되었습니다.")

    # 5. Add the category column and save the result
    print(f"\n5. 품목계열을 추가하고 최종 결과를 '{output_file}' 파일로 저장합니다...")
    
    # Add 'category' column using the map created earlier
    inventory_df['품목계열'] = inventory_df.index.map(category_map)
    
    # Reorder columns to have '품목계열' first
    date_columns = [col for col in inventory_df.columns if col != '품목계열']
    final_df = inventory_df[['품목계열'] + date_columns]
    
    final_df.to_excel(output_file)
    
    print("\n--- 작업 완료 ---")
    print(f"바탕화면의 '{os.path.basename(output_file)}' 파일에서 결과를 확인해주세요.")

except FileNotFoundError as e:
    print(f"\n[오류] 파일을 찾을 수 없습니다: {e.filename}")
    print("바탕화면에 'serials.csv'와 'logs.csv' 파일이 있는지, 파일 이름이 정확한지 확인해주세요.")
except Exception as e:
    print(f"\n[오류] 스크립트 실행 중 예상치 못한 문제가 발생했습니다: {e}")
    print("CSV 파일의 형식이나 내용이 예상과 다를 수 있습니다. (예: 날짜 형식, 열 위치, 인코딩 문제 등)")
