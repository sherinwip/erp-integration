package com.technomile.erpconfigapi.controller;

import com.technomile.erpconfigapi.dto.ClientDtos.*;
import com.technomile.erpconfigapi.service.ClientService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("${app.api.base-path:/api/config}/clients")
public class ClientController {

    private final ClientService clientService;

    public ClientController(ClientService clientService) {
        this.clientService = clientService;
    }

    @GetMapping
    public List<ClientReadDto> list(@RequestParam(defaultValue = "0") int skip,
                                    @RequestParam(defaultValue = "100") int limit) {
        return clientService.list(skip, limit);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ClientReadDto create(@Valid @RequestBody ClientCreateDto payload) {
        return clientService.create(payload);
    }

    @GetMapping("/{clientId}")
    public ClientReadDto get(@PathVariable String clientId) {
        return clientService.get(clientId);
    }

    @PatchMapping("/{clientId}")
    public ClientReadDto update(@PathVariable String clientId, @RequestBody ClientUpdateDto payload) {
        return clientService.update(clientId, payload);
    }

    @DeleteMapping("/{clientId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String clientId) {
        clientService.delete(clientId);
    }
}
