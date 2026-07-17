package com.technomile.erpconfigapi.service;

import com.technomile.erpconfigapi.common.AppException;
import com.technomile.erpconfigapi.common.MapperUtil;
import com.technomile.erpconfigapi.dto.StepDtos.*;
import com.technomile.erpconfigapi.entity.Step;
import com.technomile.erpconfigapi.entity.Target;
import com.technomile.erpconfigapi.repository.StepRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class StepService {
    private final StepRepository stepRepository;
    private final ClientService clientService;
    private final TargetService targetService;

    public StepService(StepRepository stepRepository, ClientService clientService, TargetService targetService) {
        this.stepRepository = stepRepository;
        this.clientService = clientService;
        this.targetService = targetService;
    }

    public List<StepReadDto> list(String clientId, int skip, int limit) {
        if (clientId != null && !clientId.isBlank()) {
            return stepRepository.findByClientId(clientId).stream().map(MapperUtil::toStepRead).toList();
        }
        int page = limit > 0 ? skip / limit : 0;
        return stepRepository.findAll(PageRequest.of(page, Math.max(limit, 1))).stream().map(MapperUtil::toStepRead).toList();
    }

    public StepReadDto create(StepCreateDto payload) {
        clientService.findEntity(payload.client_id());
        Target target = targetService.findEntity(payload.target_id());
        if (!target.getClientId().equals(payload.client_id())) {
            throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, "ValidationError",
                    "Target '" + payload.target_id() + "' belongs to client '" + target.getClientId() + "', not '" + payload.client_id() + "'");
        }
        if (stepRepository.findByClientIdAndStepName(payload.client_id(), payload.step_name()).isPresent()) {
            throw new AppException(HttpStatus.CONFLICT, "Conflict",
                    "Step name '" + payload.step_name() + "' already exists for client '" + payload.client_id() + "'");
        }

        Step entity = new Step();
        entity.setClientId(payload.client_id());
        entity.setTargetId(payload.target_id());
        entity.setStepName(payload.step_name());
        entity.setMethod(payload.method());
        entity.setPath(payload.path());
        entity.setQueryParams(payload.query_params());
        entity.setHeaders(payload.headers());
        entity.setExtract(payload.extract());
        entity.setOnNotFound(payload.on_not_found() == null ? "fail" : payload.on_not_found());
        entity.setOnMultipleResults(payload.on_multiple_results() == null ? "useFirst" : payload.on_multiple_results());
        entity.setRollbackMethod(payload.rollback_method());
        entity.setRollbackPath(payload.rollback_path());
        entity.setIsActive(payload.is_active() == null ? Boolean.TRUE : payload.is_active());
        return MapperUtil.toStepRead(stepRepository.save(entity));
    }

    public StepReadDto get(Long stepPk) {
        return MapperUtil.toStepRead(findEntity(stepPk));
    }

    public StepReadDto update(Long stepPk, StepUpdateDto payload) {
        Step entity = findEntity(stepPk);
        if (payload.target_id() != null) {
            Target target = targetService.findEntity(payload.target_id());
            if (!target.getClientId().equals(entity.getClientId())) {
                throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, "ValidationError",
                        "Target '" + payload.target_id() + "' belongs to client '" + target.getClientId() + "', not '" + entity.getClientId() + "'");
            }
            entity.setTargetId(payload.target_id());
        }
        if (payload.step_name() != null) entity.setStepName(payload.step_name());
        if (payload.method() != null) entity.setMethod(payload.method());
        if (payload.path() != null) entity.setPath(payload.path());
        if (payload.query_params() != null) entity.setQueryParams(payload.query_params());
        if (payload.headers() != null) entity.setHeaders(payload.headers());
        if (payload.extract() != null) entity.setExtract(payload.extract());
        if (payload.on_not_found() != null) entity.setOnNotFound(payload.on_not_found());
        if (payload.on_multiple_results() != null) entity.setOnMultipleResults(payload.on_multiple_results());
        if (payload.rollback_method() != null) entity.setRollbackMethod(payload.rollback_method());
        if (payload.rollback_path() != null) entity.setRollbackPath(payload.rollback_path());
        if (payload.is_active() != null) entity.setIsActive(payload.is_active());
        return MapperUtil.toStepRead(stepRepository.save(entity));
    }

    public void delete(Long stepPk) {
        stepRepository.delete(findEntity(stepPk));
    }

    public Step findEntity(Long stepPk) {
        return stepRepository.findById(stepPk)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "NotFound", "Step '" + stepPk + "' not found"));
    }
}
