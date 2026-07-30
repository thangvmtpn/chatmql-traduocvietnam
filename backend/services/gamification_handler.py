import json
import math
from datetime import datetime
from model.gamification_model import get_deal_shock_history_db, get_top_race_raw_stats_db, get_gamification_config_db, get_previous_gamification_db
from datetime import datetime, timedelta
try:
    from dateutil.relativedelta import relativedelta
except ImportError:
    relativedelta = None

async def create_gami_handler(data: dict, user_id, user_name):
    from model.gamification_model import create_gami_post_db
    return await create_gami_post_db(data, user_id, user_name)

async def update_gami_handler(post_id: int, data: dict):
    from model.gamification_model import update_gami_post_db
    return await update_gami_post_db(post_id, data)

async def delete_gami_handler(post_id: int):
    from model.gamification_model import delete_gami_post_db
    return await delete_gami_post_db(post_id)

async def list_gami_handler(post_type: str, page: int, limit: int):
    from model.gamification_model import get_gami_posts_db
    return await get_gami_posts_db(post_type, page, limit)

async def calculate_deal_shock_stats(post_id: int):
    try:
        raw_data = await get_deal_shock_history_db(post_id)
        
        if not raw_data:
            return {"status": "success", "data": []}

        stats_by_user = {}
        for row in raw_data:
            uid = row['user_id']
            if uid not in stats_by_user:
                stats_by_user[uid] = {
                    'user_id': uid,
                    'user_name': row['user_name'] or f"Mã NV: {uid}",
                    'total_reward': 0,
                    'details': []
                }
            
            stats_by_user[uid]['total_reward'] += float(row['total_reward'])
            
            stats_by_user[uid]['details'].append({
                'product_code': row['product_code'],
                'deals': int(row['total_deals']),
                'reward': float(row['total_reward'])
            })

        final_result = list(stats_by_user.values())
        final_result.sort(key=lambda x: x['total_reward'], reverse=True)

        return {"status": "success", "data": final_result}
        
    except Exception as e:
        print(f"Lỗi calculate_deal_shock_stats: {e}")
        return {"status": "error", "data": []}


async def calculate_top_race_stats(post_id: int):
    try:
        post = await get_gamification_config_db(post_id)
        if not post:
            return {"status": "error", "message": "Không tìm thấy chiến dịch"}

        start_date_str = str(post.get('start_date'))
        end_date_str = str(post.get('end_date') or start_date_str)
        frequency = post.get('frequency', 'WEEKLY')
        
        config_data_str = post.get('config_data')
        config_data = json.loads(config_data_str) if isinstance(config_data_str, str) else config_data_str
        reward_mode = config_data.get('reward_mode', 'TOP')
        biz_config = config_data.get('biz_config', {})
        
        le_pct = float(biz_config.get('daily_input_percent', 70)) / 100.0
        
        chung_config = biz_config.get('chung', {})
        chung_pct = float(chung_config.get('daily_input_percent', 80)) / 100.0

        prev_post = await get_previous_gamification_db(frequency, start_date_str)
        
        prev_biz_config = {}
        if prev_post:
            prev_start_str = str(prev_post.get('start_date'))
            prev_end_str = str(prev_post.get('end_date') or prev_start_str)
            has_prev_period = True
            
            p_config_str = prev_post.get('config_data', '{}')
            p_config = json.loads(p_config_str) if isinstance(p_config_str, str) else p_config_str
            prev_biz_config = p_config.get('biz_config', {})
        else:
            prev_start_str = "1970-01-01" 
            prev_end_str = "1970-01-01"
            has_prev_period = False

        raw_stats = await get_top_race_raw_stats_db(start_date_str, end_date_str)
        
        # Sửa phần lấy prev_stats_map để nó cũng map theo từng KÊNH thay vì chỉ user_id
        prev_stats_map = {}
        if has_prev_period:
            prev_raw_stats = await get_top_race_raw_stats_db(prev_start_str, prev_end_str)
            for st in prev_raw_stats:
                key = f"{st['user_id']}_{st['channel_name']}"
                prev_stats_map[key] = {
                    "revenue": float(st.get('total_revenue') or 0),
                    "orders": int(st.get('total_orders') or 0)
                }

        cskh_stats, live_stats, san_stats = [], [], []

        for stat in raw_stats:
            channel_raw = str(stat.get('channel_name') or '').upper()
            user_id = str(stat['user_id']).upper()
            
            # Phân loại vào 3 nhóm chính
            if 'LIVE' in channel_raw:
                live_stats.append(stat)
            elif 'SHOPEE' in channel_raw or 'LAZADA' in channel_raw or 'SHOP' in channel_raw or user_id == 'TMDT' or 'TIKTOK' in channel_raw:
                san_stats.append(stat)
            else:
                cskh_stats.append(stat)

        def process_channel(channel_key, main_group_name, stats_list):
            channel_config = biz_config.get(channel_key, {})
            prev_channel_config = prev_biz_config.get(channel_key, {})
            
            condition_type = channel_config.get('condition_type', 'AOV')
            top_rewards = channel_config.get('rewards', []) if reward_mode == 'TOP' or condition_type == 'CUSTOM_OR' else []
            target_reward = float(channel_config.get('target_reward') or 0)
            
            cond1_orders = float(channel_config.get('cond1_orders') or 0)
            cond2_aov = float(channel_config.get('cond2_aov') or 0)
            cond2_cpbh = float(channel_config.get('cond2_cpbh') or 0)
            cond2_min_orders = float(channel_config.get('cond2_min_orders') or 0)
            base_reward = float(channel_config.get('base_reward') or 0)
            
            flash_pct = float(channel_config.get('flash_pct') or 0)
            flash_time = str(channel_config.get('flash_time') or '')
            flash_reward_text = str(channel_config.get('flash_reward_text') or '')

            processed_stats = []
            
            for stat in stats_list:
                uid = stat['user_id']
                channel_name = stat.get('channel_name', main_group_name)
                revenue = float(stat['total_revenue'] or 0)
                orders = int(stat['total_orders'] or 0)
                aov = revenue / orders if orders > 0 else 0
                
                order_times = stat.get('order_times', [])
                if order_times: order_times.sort()
                
                if revenue <= 0 and orders <= 0: continue
                
                is_qualified = False
                is_qualified_top = False
                
                if condition_type == 'CUSTOM_OR':
                    passed_cond1 = (cond1_orders > 0 and orders >= cond1_orders)
                    passed_cond2 = False
                    if channel_key == 'san':
                        stat_cpbh = float(stat.get('cpbh') or 0)
                        passed_cond2 = (cond2_min_orders > 0 and orders >= cond2_min_orders)
                        if cond2_cpbh > 0 and stat_cpbh > 0:
                            passed_cond2 = passed_cond2 and (stat_cpbh <= cond2_cpbh)
                    else:
                        passed_cond2 = (cond2_aov > 0 and aov >= cond2_aov and orders >= cond2_min_orders)
                    
                    is_qualified = passed_cond1 or passed_cond2
                    is_qualified_top = passed_cond1 and passed_cond2
                    
                elif condition_type == 'AOV':
                    min_ord = float(channel_config.get('min_orders') or 0)
                    min_aov_val = float(channel_config.get('min_aov') or 0)
                    if orders >= min_ord and aov >= min_aov_val:
                        is_qualified = True
                        is_qualified_top = True 
                        
                elif condition_type == 'REVENUE':
                    min_ord = float(channel_config.get('min_orders') or 0)
                    min_rev = float(channel_config.get('min_revenue') or 0)
                    min_aov_val = float(channel_config.get('min_aov') or 0) 
                    
                    if orders >= min_ord and revenue >= min_rev and aov >= min_aov_val:
                        is_qualified = True
                        is_qualified_top = True

                passed_prev_period = True 
                
                target_orders_for_time = 0
                if condition_type == 'CUSTOM_OR':
                    target_orders_for_time = cond1_orders
                else:
                    target_orders_for_time = float(channel_config.get('min_orders') or 0)

                has_flash_reward = False
                if flash_pct > 0 and flash_time and target_orders_for_time > 0:
                    time_limit = flash_time + ":00" if len(flash_time) == 5 else flash_time
                    target_flash = math.ceil(target_orders_for_time * (flash_pct / 100.0))
                    early_count = sum(1 for t in order_times if t and t <= time_limit)
                    has_flash_reward = early_count >= target_flash
                        
                completion_time = "23:59:59" 
                if is_qualified_top and target_orders_for_time > 0:
                    idx = int(target_orders_for_time) - 1
                    if idx < len(order_times):
                        completion_time = order_times[idx]
                        
                processed_stats.append({
                    "user_id": uid,
                    "user_name": stat['user_name'] or f"Mã NV: {uid}",
                    "dept_name": main_group_name, 
                    "channel_display": channel_name, 
                    "revenue": revenue,
                    "orders": orders,
                    "is_qualified": is_qualified,
                    "is_qualified_top": is_qualified_top,
                    "passed_prev_period": passed_prev_period,
                    "has_flash_reward": has_flash_reward,
                    "flash_reward_text": flash_reward_text if has_flash_reward else "",
                    "completion_time": completion_time 
                })

            processed_stats.sort(key=lambda x: (
                0 if x['is_qualified_top'] and x['passed_prev_period'] else 1, 
                x['completion_time'], 
                -x['revenue']
            ))

            result = []
            current_rank = 1
            for stat in processed_stats:
                reward_amount = 0
                if stat['is_qualified'] and stat['passed_prev_period']:
                    if stat['is_qualified_top']:
                        if reward_mode == 'TOP' or condition_type == 'CUSTOM_OR':
                            reward_info = next((r for r in top_rewards if int(r['rank']) == current_rank), None)
                            if reward_info and float(reward_info.get('amount') or 0) > 0:
                                reward_amount = float(reward_info.get('amount'))
                                stat['rank'] = current_rank
                                current_rank += 1 
                            else:
                                reward_amount = base_reward if condition_type == 'CUSTOM_OR' else 0
                                stat['rank'] = None
                        elif reward_mode == 'TARGET':
                            reward_amount = target_reward
                            stat['rank'] = None
                    else:
                        reward_amount = base_reward if condition_type == 'CUSTOM_OR' else 0
                        stat['rank'] = None 
                else:
                    stat['rank'] = None
                    
                stat['reward'] = reward_amount
                result.append(stat)

            return result

        final_result = (
            process_channel('san', 'Kênh Sàn/Shop', san_stats) +
            process_channel('live', 'Kênh Livestream', live_stats) +
            process_channel('cskh', 'Kênh FN / CSKH', cskh_stats)
        )

        return {"status": "success", "data": final_result}
        
    except Exception as e:
        print(f"❌ Lỗi calculate_top_race_stats: {e}")
        import traceback
        traceback.print_exc()
        return {"status": "error", "data": []}