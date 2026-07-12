
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, Dict
import time

app = FastAPI(title="Oracle Fusion Contracts Mock")

TOKENS = {"sample-bearer"}
CONTRACTS: Dict[int, dict] = {}
NEXT_ID = 300100000000001

class TokenRequest(BaseModel):
    grant_type: Optional[str] = "client_credentials"
    client_id: Optional[str] = None
    client_secret: Optional[str] = None

class Contract(BaseModel):
    ContractNumber: str
    ContractName: str
    BusinessUnitName: str
    StartDate: str
    EndDate: str
    Status: Optional[str] = "DRAFT"

def auth(h):
    if not h or not h.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    if h.split()[1] not in TOKENS:
        raise HTTPException(401, "Invalid token")

@app.post("/oauth2/v1/token")
def token(req: TokenRequest):
    return {
        "access_token":"sample-bearer",
        "token_type":"bearer",
        "expires_in":3600
    }

@app.post("/fscmRestApi/resources/11.13.18.05/contracts", status_code=201)
def create(contract: Contract, authorization: str = Header(None)):
    global NEXT_ID
    auth(authorization)

    if contract.EndDate < contract.StartDate:
        return JSONResponse(
            status_code=400,
            content={
                "title":"The request could not be processed.",
                "status":400,
                "o:errorCode":"OKC-00001",
                "detail":"EndDate cannot be before StartDate."
            }
        )

    for c in CONTRACTS.values():
        if c["ContractNumber"] == contract.ContractNumber:
            return JSONResponse(
                status_code=409,
                content={
                    "title":"Duplicate resource.",
                    "status":409,
                    "detail":f"Contract {contract.ContractNumber} already exists."
                }
            )

    cid = NEXT_ID
    NEXT_ID += 1

    obj = contract.model_dump()
    obj.update({
        "ContractId": cid,
        "ObjectVersionNumber":1,
        "CreationDate": int(time.time()),
        "links":[
            {
                "rel":"self",
                "href":f"http://localhost:8000/fscmRestApi/resources/11.13.18.05/contracts/{cid}"
            }
        ]
    })

    CONTRACTS[cid]=obj
    return obj

@app.get("/fscmRestApi/resources/11.13.18.05/contracts")
def list_contracts(limit:int=25, offset:int=0,
                   ContractNumber:str|None=None,
                   authorization:str=Header(None)):
    auth(authorization)
    data=list(CONTRACTS.values())
    if ContractNumber:
        data=[x for x in data if x["ContractNumber"]==ContractNumber]
    return {
        "count":len(data),
        "items":data[offset:offset+limit]
    }

@app.get("/fscmRestApi/resources/11.13.18.05/contracts/{contract_id}")
def get_contract(contract_id:int, authorization:str=Header(None)):
    auth(authorization)
    if contract_id not in CONTRACTS:
        raise HTTPException(404,"Contract not found")
    return CONTRACTS[contract_id]

@app.patch("/fscmRestApi/resources/11.13.18.05/contracts/{contract_id}")
async def patch_contract(contract_id:int, request:Request,
                         authorization:str=Header(None)):
    auth(authorization)
    if contract_id not in CONTRACTS:
        raise HTTPException(404,"Contract not found")
    body = await request.json()
    CONTRACTS[contract_id].update(body)
    CONTRACTS[contract_id]["ObjectVersionNumber"] += 1
    return CONTRACTS[contract_id]

@app.delete("/fscmRestApi/resources/11.13.18.05/contracts/{contract_id}")
def delete_contract(contract_id:int, authorization:str=Header(None)):
    auth(authorization)
    if contract_id not in CONTRACTS:
        raise HTTPException(404,"Contract not found")
    del CONTRACTS[contract_id]
    return {"result":"deleted"}

@app.exception_handler(HTTPException)
async def handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "title":"Oracle Fusion Mock Error",
            "status":exc.status_code,
            "detail":exc.detail
        }
    )
