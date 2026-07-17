package com.technomile.erpconfigapi.service;

import com.technomile.erpconfigapi.common.AppException;
import com.technomile.erpconfigapi.common.MapperUtil;
import com.technomile.erpconfigapi.dto.PipelineDtos.*;
import com.technomile.erpconfigapi.entity.Pipeline;
import com.technomile.erpconfigapi.repository.PipelineRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;

@Service
public class PipelineService {
    private static final Set<String> SUPPORTED_PATTERNS = Set.of("PAT-01", "PAT-02", "PAT-03", "PAT-05", "PAT-06", "PAT-07", "PAT-08", "PAT-10");

    private final PipelineRepository pipelineRepository;
    private final ClientService clientService;

    public PipelineService(PipelineRepository pipelineRepository, ClientService clientService) {
        this.pipelineRepository = pipelineRepository;
        this.clientService = clientService;
    }

    public List<PipelineReadDto> list(String clientId, int skip, int limit) {
        if (clientId != null && !clientId.isBlank()) {
            return pipelineRepository.findByClientId(clientId).stream().map(MapperUtil::toPipelineRead).toList();
        }
        int page = limit > 0 ? skip / limit : 0;
        return pipelineRepository.findAll(PageRequest.of(page, Math.max(limit, 1))).stream().map(MapperUtil::toPipelineRead).toList();
    }

    public PipelineReadDto create(PipelineCreateDto payload) {
        clientService.findEntity(payload.client_id());
        validatePattern(payload.pattern_id());
        String eventType = payload.event_type() == null ? "*" : payload.event_type();
        if (pipelineRepository.existsById(payload.pipeline_id())) {
            throw new AppException(HttpStatus.CONFLICT, "Conflict", "Pipeline '" + payload.pipeline_id() + "' already exists");
        }

        Pipeline entity = new Pipeline();
        entity.setPipelineId(payload.pipeline_id());
        entity.setClientId(payload.client_id());
        entity.setVersion(payload.version() == null ? "1.0" : payload.version());
        entity.setSourceSystem(payload.source_system());
        entity.setObjectType(payload.object_type());
        entity.setEventType(eventType);
        entity.setPatternId(payload.pattern_id());
        entity.setStatus(payload.status() == null ? "active" : payload.status());
        entity.setRetryMaxAttempts(payload.retry_max_attempts() == null ? 3 : payload.retry_max_attempts());
        entity.setRetryBackoff(payload.retry_backoff() == null ? "exponential" : payload.retry_backoff());
        entity.setRetryBackoffBaseMs(payload.retry_backoff_base_ms() == null ? 2000 : payload.retry_backoff_base_ms());
        entity.setRetryOnStatusCodes(payload.retry_on_status_codes() == null ? "500,502,503,504" : payload.retry_on_status_codes());
        return MapperUtil.toPipelineRead(pipelineRepository.save(entity));
    }

    public PipelineReadDto get(String pipelineId) {
        return MapperUtil.toPipelineRead(findEntity(pipelineId));
    }

    public PipelineReadDto update(String pipelineId, PipelineUpdateDto payload) {
        Pipeline entity = findEntity(pipelineId);
        if (payload.version() != null) entity.setVersion(payload.version());
        if (payload.source_system() != null) entity.setSourceSystem(payload.source_system());
        if (payload.object_type() != null) entity.setObjectType(payload.object_type());
        if (payload.event_type() != null) entity.setEventType(payload.event_type());
        if (payload.pattern_id() != null) {
            validatePattern(payload.pattern_id());
            entity.setPatternId(payload.pattern_id());
        }
        if (payload.status() != null) entity.setStatus(payload.status());
        if (payload.retry_max_attempts() != null) entity.setRetryMaxAttempts(payload.retry_max_attempts());
        if (payload.retry_backoff() != null) entity.setRetryBackoff(payload.retry_backoff());
        if (payload.retry_backoff_base_ms() != null) entity.setRetryBackoffBaseMs(payload.retry_backoff_base_ms());
        if (payload.retry_on_status_codes() != null) entity.setRetryOnStatusCodes(payload.retry_on_status_codes());
        return MapperUtil.toPipelineRead(pipelineRepository.save(entity));
    }

    public void delete(String pipelineId) {
        pipelineRepository.delete(findEntity(pipelineId));
    }

    public Pipeline findEntity(String pipelineId) {
        return pipelineRepository.findById(pipelineId)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "NotFound", "Pipeline '" + pipelineId + "' not found"));
    }

    private void validatePattern(String patternId) {
        if (!SUPPORTED_PATTERNS.contains(patternId)) {
            throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, "ValidationError",
                    "PatternNotSupported: pattern '" + patternId + "' is not supported");
        }
    }
}
