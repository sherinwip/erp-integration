package com.technomile.erpconfigapi.service;

import com.technomile.erpconfigapi.common.AppException;
import com.technomile.erpconfigapi.common.MapperUtil;
import com.technomile.erpconfigapi.dto.TargetDtos.*;
import com.technomile.erpconfigapi.entity.Target;
import com.technomile.erpconfigapi.repository.TargetRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class TargetService {
    private final TargetRepository targetRepository;
    private final ClientService clientService;

    public TargetService(TargetRepository targetRepository, ClientService clientService) {
        this.targetRepository = targetRepository;
        this.clientService = clientService;
    }

    public List<TargetReadDto> list(String clientId, int skip, int limit) {
        if (clientId != null && !clientId.isBlank()) {
            return targetRepository.findByClientId(clientId).stream().map(MapperUtil::toTargetRead).toList();
        }
        int page = limit > 0 ? skip / limit : 0;
        return targetRepository.findAll(PageRequest.of(page, Math.max(limit, 1))).stream().map(MapperUtil::toTargetRead).toList();
    }

    public TargetReadDto create(TargetCreateDto payload) {
        clientService.findEntity(payload.client_id());
        if (targetRepository.existsById(payload.target_id())) {
            throw new AppException(HttpStatus.CONFLICT, "Conflict", "Target '" + payload.target_id() + "' already exists");
        }
        if (targetRepository.findByClientIdAndTargetName(payload.client_id(), payload.target_name()).isPresent()) {
            throw new AppException(HttpStatus.CONFLICT, "Conflict",
                    "Target name '" + payload.target_name() + "' already exists for client '" + payload.client_id() + "'");
        }

        Target entity = new Target();
        entity.setTargetId(payload.target_id());
        entity.setClientId(payload.client_id());
        entity.setTargetName(payload.target_name());
        entity.setBaseUrl(payload.base_url());
        entity.setAuthType(payload.auth_type());
        entity.setCredentialRef(payload.credential_ref());
        entity.setDefaultHeaders(payload.default_headers() == null ? java.util.Map.of() : payload.default_headers());
        entity.setIsActive(payload.is_active() == null ? Boolean.TRUE : payload.is_active());
        return MapperUtil.toTargetRead(targetRepository.save(entity));
    }

    public TargetReadDto get(String targetId) {
        return MapperUtil.toTargetRead(findEntity(targetId));
    }

    public TargetReadDto update(String targetId, TargetUpdateDto payload) {
        Target entity = findEntity(targetId);
        if (payload.target_name() != null) entity.setTargetName(payload.target_name());
        if (payload.base_url() != null) entity.setBaseUrl(payload.base_url());
        if (payload.auth_type() != null) entity.setAuthType(payload.auth_type());
        if (payload.credential_ref() != null) entity.setCredentialRef(payload.credential_ref());
        if (payload.default_headers() != null) entity.setDefaultHeaders(payload.default_headers());
        if (payload.is_active() != null) entity.setIsActive(payload.is_active());
        return MapperUtil.toTargetRead(targetRepository.save(entity));
    }

    public void delete(String targetId) {
        targetRepository.delete(findEntity(targetId));
    }

    public Target findEntity(String targetId) {
        return targetRepository.findById(targetId)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "NotFound", "Target '" + targetId + "' not found"));
    }
}
