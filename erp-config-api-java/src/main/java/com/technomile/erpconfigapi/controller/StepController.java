package com.technomile.erpconfigapi.controller;

import com.technomile.erpconfigapi.dto.StepDtos.*;
import com.technomile.erpconfigapi.service.StepService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("${app.api.base-path:/api/config}/steps")
public class StepController {

    private final StepService stepService;

    public StepController(StepService stepService) {
        this.stepService = stepService;
    }

    @GetMapping
    public List<StepReadDto> list(@RequestParam(required = false) String clientId,
                                  @RequestParam(defaultValue = "0") int skip,
                                  @RequestParam(defaultValue = "100") int limit) {
        return stepService.list(clientId, skip, limit);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public StepReadDto create(@Valid @RequestBody StepCreateDto payload) {
        return stepService.create(payload);
    }

    @GetMapping("/{stepPk}")
    public StepReadDto get(@PathVariable Long stepPk) {
        return stepService.get(stepPk);
    }

    @PatchMapping("/{stepPk}")
    public StepReadDto update(@PathVariable Long stepPk, @RequestBody StepUpdateDto payload) {
        return stepService.update(stepPk, payload);
    }

    @DeleteMapping("/{stepPk}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long stepPk) {
        stepService.delete(stepPk);
    }
}
