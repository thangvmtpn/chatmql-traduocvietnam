from pydantic import BaseModel, Field
from typing import Dict, Any, Optional

class GamiPostRequest(BaseModel):
    type: str = "TOP_RACE" 
    title: str
    frequency: Optional[str] = "MONTH" 
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    
    apply_date: Optional[str] = None 
    target_description: Optional[str] = None
    config_data: Dict[str, Any]