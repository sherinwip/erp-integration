package com.technomile.erpconfigapi.controller;

import com.technomile.erpconfigapi.dto.TargetDtos.*;
import com.technomile.erpconfigapi.service.TargetService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("${app.api.base-path:/api/config}/targets")
public class TargetController {

    private final TargetService targetService;

    public TargetController(TargetService targetService) {
        this.targetService = targetService;
    }

    @GetMapping
    public List<TargetReadDto> list(@RequestParam(required = false) String clientId,
                                    @RequestParam(defaultValue = "0") int skip,
                                    @RequestParam(defaultValue = "100") int limit) {
        return targetService.list(clientId, skip, limit);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TargetReadDto create(@Valid @RequestBody TargetCreateDto payload) {
        return targetService.create(payload);
    }

    @GetMapping("/{targetId}")
    public TargetReadDto get(@PathVariable String targetId) {
        return targetService.get(targetId);
    }

    @PatchMapping("/{targetId}")
    public TargetReadDto update(@PathVariable String targetId, @RequestBody TargetUpdateDto payload) {
        return targetService.update(targetId, payload);
    }

    @DeleteMapping("/{targetId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String targetId) {
        targetService.delete(targetId);
    }
}
