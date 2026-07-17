package com.technomile.erpconfigapi.service;

import com.technomile.erpconfigapi.common.AppException;
import com.technomile.erpconfigapi.common.MapperUtil;
import com.technomile.erpconfigapi.dto.ClientDtos.*;
import com.technomile.erpconfigapi.entity.Client;
import com.technomile.erpconfigapi.repository.ClientRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ClientService {
    private final ClientRepository clientRepository;

    public ClientService(ClientRepository clientRepository) {
        this.clientRepository = clientRepository;
    }

    public List<ClientReadDto> list(int skip, int limit) {
        int page = limit > 0 ? skip / limit : 0;
        return clientRepository.findAll(PageRequest.of(page, Math.max(limit, 1))).stream().map(MapperUtil::toClientRead).toList();
    }

    public ClientReadDto create(ClientCreateDto payload) {
        if (clientRepository.existsById(payload.client_id())) {
            throw new AppException(HttpStatus.CONFLICT, "Conflict", "Client '" + payload.client_id() + "' already exists");
        }
        Client entity = new Client();
        entity.setClientId(payload.client_id());
        entity.setClientName(payload.client_name());
        entity.setIsActive(payload.is_active() == null ? Boolean.TRUE : payload.is_active());
        return MapperUtil.toClientRead(clientRepository.save(entity));
    }

    public ClientReadDto get(String clientId) {
        return MapperUtil.toClientRead(findEntity(clientId));
    }

    public ClientReadDto update(String clientId, ClientUpdateDto payload) {
        Client entity = findEntity(clientId);
        if (payload.client_name() != null) entity.setClientName(payload.client_name());
        if (payload.is_active() != null) entity.setIsActive(payload.is_active());
        return MapperUtil.toClientRead(clientRepository.save(entity));
    }

    public void delete(String clientId) {
        Client entity = findEntity(clientId);
        clientRepository.delete(entity);
    }

    public Client findEntity(String clientId) {
        return clientRepository.findById(clientId)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "NotFound", "Client '" + clientId + "' not found"));
    }
}
