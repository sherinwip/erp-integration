package com.technomile.erpconfigapi.controller;

import com.technomile.erpconfigapi.dto.FieldMappingDtos.*;
import com.technomile.erpconfigapi.service.FieldMappingService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("${app.api.base-path:/api/config}/field-mappings")
public class FieldMappingController {

    private final FieldMappingService fieldMappingService;

    public FieldMappingController(FieldMappingService fieldMappingService) {
        this.fieldMappingService = fieldMappingService;
    }

    @GetMapping
    public List<FieldMappingReadDto> list(@RequestParam(required = false) Long stepPk,
                                          @RequestParam(defaultValue = "0") int skip,
                                          @RequestParam(defaultValue = "100") int limit) {
        return fieldMappingService.list(stepPk, skip, limit);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public FieldMappingReadDto create(@Valid @RequestBody FieldMappingCreateDto payload) {
        return fieldMappingService.create(payload);
    }

    @PostMapping("/bulk")
    @ResponseStatus(HttpStatus.CREATED)
    public List<FieldMappingReadDto> createBulk(@Valid @RequestBody FieldMappingBulkCreateDto payload) {
        return fieldMappingService.createBulk(payload);
    }

    @GetMapping("/{mappingPk}")
    public FieldMappingReadDto get(@PathVariable Long mappingPk) {
        return fieldMappingService.get(mappingPk);
    }

    @PatchMapping("/{mappingPk}")
    public FieldMappingReadDto update(@PathVariable Long mappingPk, @RequestBody FieldMappingUpdateDto payload) {
        return fieldMappingService.update(mappingPk, payload);
    }

    @DeleteMapping("/{mappingPk}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long mappingPk) {
        fieldMappingService.delete(mappingPk);
    }
}
