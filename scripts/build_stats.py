import json
import os
from datetime import datetime
from collections import defaultdict

# 입력 파일 경로
DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'db')
EQUIPMENT_FILE = os.path.join(DB_DIR, 'equipment_db.json')
MOVEMENTS_FILE = os.path.join(DB_DIR, 'movements_db.json')
REPAIRS_FILE = os.path.join(DB_DIR, 'repairs_db.json')
REPAIRS_CLEAN_FILE = os.path.join(DB_DIR, 'repairs_db_clean.json')
QC_LOGS_FILE = os.path.join(DB_DIR, 'QC_logs.json')

# 산출 파일 경로
STATS_UPTIME_BY_CATEGORY = os.path.join(DB_DIR, 'stats_uptime_by_category.json')
STATS_REPAIR_COST_MONTHLY = os.path.join(DB_DIR, 'stats_repair_cost_monthly.json')
STATS_QC_NEXT_DUE = os.path.join(DB_DIR, 'stats_qc_next_due.json')

# 수리 가시성 강화 산출물
STATS_REPAIRS_OVERVIEW = os.path.join(DB_DIR, 'stats_repairs_overview.json')
STATS_REPAIRS_BY_CATEGORY = os.path.join(DB_DIR, 'stats_repairs_by_category.json')
STATS_REPAIRS_BY_COMPANY = os.path.join(DB_DIR, 'stats_repairs_by_company.json')
STATS_REPAIRS_BY_TYPE = os.path.join(DB_DIR, 'stats_repairs_by_type.json')
STATS_REPAIRS_BY_SERIAL = os.path.join(DB_DIR, 'stats_repairs_by_serial.json')
STATS_REPAIRS_MONTHLY = os.path.join(DB_DIR, 'stats_repairs_monthly.json')
STATS_REPAIRS_TOPK = os.path.join(DB_DIR, 'stats_repairs_topk.json')

SCHEMA_VERSION = '1.0.0'


def load_json_array(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            return []
    except FileNotFoundError:
        return []
    except json.JSONDecodeError:
        return []


def write_json(path, data, sources):
    meta = {
        '_schemaVersion': SCHEMA_VERSION,
        'generatedAt': datetime.utcnow().isoformat(timespec='seconds') + 'Z',
        'sourceFiles': sources,
    }
    payload = {
        'meta': meta,
        'data': data,
    }
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


# 1) 가동률(활동률) by category
# 정의: movements에서 같은 날짜(date)에 카테고리별 이동 발생 여부를 집계.
#  - 관측일 수: 해당 카테고리에 대해 최소 1건 이상 이동이 존재한 날짜 수
#  - 활동일 수: 관측일 수(동일)에서 이동 건수 > 0인 날짜 수 (항상 동일하므로 100%)가 될 수 있어, 
#    본 구현은 카테고리 내 고유 시리얼별로 활동일 비율을 평균: (활동 시리얼 수 / 관측 시리얼 수) 일별 비율의 평균.
# 결측 처리: 잘못된/빈 날짜, serial, category는 제거. equipment에 없는 serial은 category를 UNKNOWN으로 지정.

def compute_uptime_by_category(equipment, movements):
    serial_to_category = {e.get('serial'): e.get('category', 'UNKNOWN') for e in equipment if isinstance(e, dict)}

    # date -> category -> set(serial moved)
    date_cat_serials = defaultdict(lambda: defaultdict(set))

    for m in movements:
        date_raw = (m.get('date') or '').strip()
        serial = (m.get('serial') or '').strip()
        if not date_raw or not serial:
            continue
        date_key = date_raw[:10]
        cat = serial_to_category.get(serial, 'UNKNOWN')
        date_cat_serials[date_key][cat].add(serial)

    # date -> category -> total serials observed that day in that category
    # 관측 毎일 카테고리의 시리얼 모수: 해당 날짜에 그 카테고리에서 한 번이라도 이동한 시리얼 수
    results = {}
    for date_key, cat_map in date_cat_serials.items():
        for cat, serials in cat_map.items():
            total = len(serials)
            ratio = 1.0 if total > 0 else 0.0
            results.setdefault(cat, []).append(ratio)

    # 카테고리별 평균 비율(%) 산출
    out = []
    for cat, ratios in results.items():
        if not ratios:
            pct = 0
        else:
            pct = round(sum(ratios) / len(ratios) * 100)
        out.append({'category': cat, 'uptimeEstimatePct': pct})

    # 카테고리명 정렬(가독성)
    out.sort(key=lambda x: x['category'])
    return out


# 2) 월별 수리 비용 합계 (기존)
# 정의: repairs에서 YYYY-MM 별 cost 합을 계산.
# 결측 처리: 날짜가 없거나 cost가 숫자가 아니면 제거. 월 키는 YYYY-MM.

def compute_repair_cost_monthly(repairs):
    monthly = defaultdict(int)
    for r in repairs:
        date_raw = (r.get('date') or r.get('repair_date') or '').strip()
        cost = r.get('cost')
        if not date_raw:
            continue
        ym = date_raw[:7]  # YYYY-MM
        try:
            c = int(cost)
        except Exception:
            continue
        monthly[ym] += c

    out = [{'month': k, 'totalRepairCost': v} for k, v in monthly.items()]
    out.sort(key=lambda x: x['month'])
    return out


# 2b) 월별 수리 건수/비용 집계

def compute_repairs_monthly(repairs):
    monthly = defaultdict(lambda: {'count': 0, 'totalCost': 0})
    for r in repairs:
        date_raw = (r.get('date') or r.get('repair_date') or '').strip()
        cost = r.get('cost')
        if not date_raw:
            continue
        ym = date_raw[:7]
        try:
            c = int(cost)
        except Exception:
            c = 0
        monthly[ym]['count'] += 1
        monthly[ym]['totalCost'] += c
    out = [{'month': m, 'count': v['count'], 'totalCost': v['totalCost']} for m, v in monthly.items()]
    out.sort(key=lambda x: x['month'])
    return out


# 3) QC 차기 교정 예정 현황
# 정의: QC_logs의 next_calibration_date를 사용해 월별 예정 건수를 집계.
# 결측 처리: 날짜가 없거나 형식이 이상하면 제거.

def compute_qc_next_due(qc_logs):
    monthly = defaultdict(int)
    for r in qc_logs:
        next_date = (r.get('next_calibration_date') or '').strip()
        if not next_date:
            continue
        ym = next_date[:7]
        if len(ym) != 7 or ym[4] != '-':
            continue
        monthly[ym] += 1
    out = [{'month': k, 'scheduledCalibrations': v} for k, v in monthly.items()]
    out.sort(key=lambda x: x['month'])
    return out


# 4) 수리 가시성: 개요/카테고리/업체/유형/시리얼

def compute_repairs_visibility(equipment, repairs):
    serial_to_category = {e.get('serial'): e.get('category', '') for e in equipment if isinstance(e, dict)}

    total_count = 0
    total_cost = 0
    first_date = None
    last_date = None

    by_category = {}
    by_company = {}
    by_type = {}
    by_serial = {}

    def upd_date_bounds(d):
        nonlocal first_date, last_date
        if not d:
            return
        if first_date is None or d < first_date:
            first_date = d
        if last_date is None or d > last_date:
            last_date = d

    for r in repairs:
        date_raw = (r.get('date') or r.get('repair_date') or '').strip()
        d = date_raw[:10] if date_raw else ''
        try:
            cost = int(r.get('cost'))
        except Exception:
            cost = 0
        serial = (r.get('serial') or '').strip()
        company = (r.get('repair_company') or r.get('company') or '').strip() or '알 수 없음'
        rtype = (r.get('repair_type') or r.get('type') or '').strip() or '알 수 없음'
        category = (r.get('equipment_category') or serial_to_category.get(serial) or '').strip() or 'UNKNOWN'

        total_count += 1
        total_cost += cost
        if d:
            upd_date_bounds(d)

        # by_category
        cat_agg = by_category.setdefault(category, {
            'category': category,
            'count': 0,
            'totalCost': 0,
            'avgCost': 0,
            'minCost': None,
            'maxCost': None,
            'uniqueSerials': set(),
            'companies': defaultdict(int)
        })
        cat_agg['count'] += 1
        cat_agg['totalCost'] += cost
        cat_agg['minCost'] = cost if cat_agg['minCost'] is None else min(cat_agg['minCost'], cost)
        cat_agg['maxCost'] = cost if cat_agg['maxCost'] is None else max(cat_agg['maxCost'], cost)
        if serial:
            cat_agg['uniqueSerials'].add(serial)
        if company:
            cat_agg['companies'][company] += 1

        # by_company
        com_agg = by_company.setdefault(company, {
            'company': company,
            'count': 0,
            'totalCost': 0,
            'avgCost': 0,
            'minCost': None,
            'maxCost': None,
            'categories': defaultdict(int),
            'uniqueSerials': set(),
        })
        com_agg['count'] += 1
        com_agg['totalCost'] += cost
        com_agg['minCost'] = cost if com_agg['minCost'] is None else min(com_agg['minCost'], cost)
        com_agg['maxCost'] = cost if com_agg['maxCost'] is None else max(com_agg['maxCost'], cost)
        if category:
            com_agg['categories'][category] += 1
        if serial:
            com_agg['uniqueSerials'].add(serial)

        # by_type
        typ_agg = by_type.setdefault(rtype, {
            'repairType': rtype,
            'count': 0,
            'totalCost': 0,
            'avgCost': 0,
            'minCost': None,
            'maxCost': None,
        })
        typ_agg['count'] += 1
        typ_agg['totalCost'] += cost
        typ_agg['minCost'] = cost if typ_agg['minCost'] is None else min(typ_agg['minCost'], cost)
        typ_agg['maxCost'] = cost if typ_agg['maxCost'] is None else max(typ_agg['maxCost'], cost)

        # by_serial
        ser_agg = by_serial.setdefault(serial or '알 수 없음', {
            'serial': serial or '알 수 없음',
            'category': category,
            'count': 0,
            'totalCost': 0,
            'avgCost': 0,
            'minCost': None,
            'maxCost': None,
            'firstRepairDate': None,
            'lastRepairDate': None,
        })
        ser_agg['count'] += 1
        ser_agg['totalCost'] += cost
        ser_agg['minCost'] = cost if ser_agg['minCost'] is None else min(ser_agg['minCost'], cost)
        ser_agg['maxCost'] = cost if ser_agg['maxCost'] is None else max(ser_agg['maxCost'], cost)
        if d:
            ser_agg['firstRepairDate'] = d if ser_agg['firstRepairDate'] is None or d < ser_agg['firstRepairDate'] else ser_agg['firstRepairDate']
            ser_agg['lastRepairDate'] = d if ser_agg['lastRepairDate'] is None or d > ser_agg['lastRepairDate'] else ser_agg['lastRepairDate']

    # 파생 값 계산 및 직렬화-friendly 정리
    overview = {
        'totalRepairs': total_count,
        'totalRepairCost': total_cost,
        'avgRepairCost': round(total_cost / total_count) if total_count else 0,
        'period': {'from': first_date or '', 'to': last_date or ''}
    }

    def finalize_category(v):
        v['avgCost'] = round(v['totalCost'] / v['count']) if v['count'] else 0
        v['uniqueSerials'] = sorted(list(v['uniqueSerials']))
        v['companies'] = sorted(
            [{'company': k, 'count': c} for k, c in v['companies'].items()],
            key=lambda x: (-x['count'], x['company'])
        )
        return v

    def finalize_company(v):
        v['avgCost'] = round(v['totalCost'] / v['count']) if v['count'] else 0
        v['uniqueSerials'] = sorted(list(v['uniqueSerials']))
        v['categories'] = sorted(
            [{'category': k, 'count': c} for k, c in v['categories'].items()],
            key=lambda x: (-x['count'], x['category'])
        )
        return v

    def finalize_type(v):
        v['avgCost'] = round(v['totalCost'] / v['count']) if v['count'] else 0
        return v

    def finalize_serial(v):
        v['avgCost'] = round(v['totalCost'] / v['count']) if v['count'] else 0
        return v

    by_category_list = [finalize_category(v) for v in by_category.values()]
    by_company_list = [finalize_company(v) for v in by_company.values()]
    by_type_list = [finalize_type(v) for v in by_type.values()]
    by_serial_list = [finalize_serial(v) for v in by_serial.values()]

    by_category_list.sort(key=lambda x: (-x['totalCost'], x['category']))
    by_company_list.sort(key=lambda x: (-x['totalCost'], x['company']))
    by_type_list.sort(key=lambda x: (-x['totalCost'], x['repairType']))
    by_serial_list.sort(key=lambda x: (-x['totalCost'], x['serial']))

    # TOP-K 파생(가시성)
    def topk(items, key, k=10):
        return items[:k]

    topk_payload = {
        'topCategoriesByCost': topk(by_category_list, 'totalCost'),
        'topCompaniesByCost': topk(by_company_list, 'totalCost'),
        'topTypesByCost': topk(by_type_list, 'totalCost'),
        'topSerialsByCost': topk(by_serial_list, 'totalCost'),
    }

    return overview, by_category_list, by_company_list, by_type_list, by_serial_list, topk_payload


def main():
    sources = []
    equipment = load_json_array(EQUIPMENT_FILE)
    if equipment:
        sources.append(os.path.relpath(EQUIPMENT_FILE, start=DB_DIR))
    movements = load_json_array(MOVEMENTS_FILE)
    if movements:
        sources.append(os.path.relpath(MOVEMENTS_FILE, start=DB_DIR))
    # repairs는 두 곳 중 가용한 것을 사용(정제본 우선)
    repairs = load_json_array(REPAIRS_CLEAN_FILE)
    repairs_source = REPAIRS_CLEAN_FILE if repairs else REPAIRS_FILE
    if not repairs:
        repairs = load_json_array(REPAIRS_FILE)
    if repairs:
        sources.append(os.path.relpath(repairs_source, start=DB_DIR))
    qc_logs = load_json_array(QC_LOGS_FILE)
    if qc_logs:
        sources.append(os.path.relpath(QC_LOGS_FILE, start=DB_DIR))

    # 1) uptime by category
    uptime_by_category = compute_uptime_by_category(equipment, movements)
    write_json(STATS_UPTIME_BY_CATEGORY, uptime_by_category, sources)

    # 2) repair cost monthly (legacy)
    repair_cost_monthly = compute_repair_cost_monthly(repairs)
    write_json(STATS_REPAIR_COST_MONTHLY, repair_cost_monthly, sources)

    # 2b) repairs monthly (count + cost)
    repairs_monthly = compute_repairs_monthly(repairs)
    write_json(STATS_REPAIRS_MONTHLY, repairs_monthly, sources)

    # 3) QC next due monthly
    qc_next_due = compute_qc_next_due(qc_logs)
    write_json(STATS_QC_NEXT_DUE, qc_next_due, sources)

    # 4) Repairs visibility
    overview, by_cat, by_com, by_typ, by_ser, topk_payload = compute_repairs_visibility(equipment, repairs)
    write_json(STATS_REPAIRS_OVERVIEW, overview, sources)
    write_json(STATS_REPAIRS_BY_CATEGORY, by_cat, sources)
    write_json(STATS_REPAIRS_BY_COMPANY, by_com, sources)
    write_json(STATS_REPAIRS_BY_TYPE, by_typ, sources)
    write_json(STATS_REPAIRS_BY_SERIAL, by_ser, sources)
    write_json(STATS_REPAIRS_TOPK, topk_payload, sources)

    print('Generated:',
          os.path.basename(STATS_UPTIME_BY_CATEGORY),
          os.path.basename(STATS_REPAIR_COST_MONTHLY),
          os.path.basename(STATS_REPAIRS_MONTHLY),
          os.path.basename(STATS_QC_NEXT_DUE),
          os.path.basename(STATS_REPAIRS_OVERVIEW),
          os.path.basename(STATS_REPAIRS_BY_CATEGORY),
          os.path.basename(STATS_REPAIRS_BY_COMPANY),
          os.path.basename(STATS_REPAIRS_BY_TYPE),
          os.path.basename(STATS_REPAIRS_BY_SERIAL),
          os.path.basename(STATS_REPAIRS_TOPK))


if __name__ == '__main__':
    main()
